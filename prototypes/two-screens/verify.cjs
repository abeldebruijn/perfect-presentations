const {chromium} = require('playwright');
const {createServer} = require('node:http');
const {readFileSync,writeFileSync} = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const files = {
    '/grafiek': ['route.html', 'text/html'],
    '/bundle.js': ['bundle.js', 'text/javascript'],
    '/bundle.css': ['bundle.css', 'text/css'],
  };
  const server = createServer((req, res) => {
    const asset = files[req.url];
    if (!asset) {res.writeHead(404).end(); return;}
    const [file, type] = asset;
    res.setHeader('Content-Type', type);
    res.end(readFileSync(file));
  });
  const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const results = [];
  try {
    for (const url of [`file://${process.cwd()}/prototype.html`, `http://127.0.0.1:${server.address().port}/grafiek`]) {
      const context = await browser.newContext({viewport:{width:1400,height:1000},offline:url.startsWith('file:')});
      const presenter = await context.newPage();
      await presenter.goto(url);
      const popup = presenter.waitForEvent('popup');
      await presenter.getByText('Publiek openen',{exact:true}).click();
      let audience = await popup;
      await audience.getByRole('heading',{name:'Twee schermen, één verhaal'}).waitFor();
      await presenter.locator('article').click();
      await presenter.keyboard.press('ArrowRight');
      await audience.getByRole('heading',{name:'Wat ik wil bespreken'}).waitFor();
      const slideBounds = await presenter.locator('article').boundingBox();
      await presenter.mouse.move(slideBounds.x + 35, slideBounds.y + 35);
      await audience.locator('.slide-peer-cursor').waitFor();
      await presenter.mouse.down({button:'right'});
      await presenter.mouse.move(slideBounds.x + 160, slideBounds.y + 140);
      await audience.locator('.peer .drag').waitFor();
      await presenter.mouse.up({button:'right'});
      await audience.locator('.peer .drag').waitFor({state:'detached'});
      await audience.locator('h1').evaluate(heading => {
        const range = document.createRange();
        range.selectNodeContents(heading);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });
      await presenter.locator('.peer .selection').waitFor();
      await audience.evaluate(() => window.getSelection().removeAllRanges());
      await presenter.locator('.peer .selection').waitFor({state:'detached'});
      await audience.locator('article').click();
      await audience.keyboard.press('ArrowRight');
      await presenter.getByRole('heading',{name:'Probeer de interactie'}).waitFor();
      await audience.getByText('Antwoord tonen',{exact:true}).click();
      await presenter.getByTestId('answer').waitFor();
      await audience.getByLabel('Probeer pijltjestoetsen').fill('test');
      await audience.keyboard.press('ArrowLeft');
      assert.match(await audience.locator('h1').innerText(),/Probeer/);
      await presenter.getByLabel('Klok op').selectOption('both');
      await audience.getByTestId('timer').waitFor();
      await presenter.getByLabel('Klok op').selectOption('viewer');
      await presenter.getByTestId('timer').waitFor({state:'detached'});
      await audience.getByTestId('timer').waitFor();
      await presenter.getByLabel('Klok op').selectOption('presenter');
      await audience.getByTestId('timer').waitFor({state:'detached'});
      await presenter.getByTestId('timer').waitFor();
      await presenter.getByLabel('Schatting',{exact:true}).fill('1');
      await presenter.getByText('Timer starten',{exact:true}).click();
      await presenter.getByTestId('timer').filter({hasText:'uitloop'}).waitFor();
      await presenter.getByText('Pauzeren',{exact:true}).click();
      const paused = await presenter.getByTestId('timer').innerText();
      await presenter.waitForTimeout(1100);
      assert.equal(await presenter.getByTestId('timer').innerText(),paused);
      await presenter.getByText('Vorige',{exact:true}).click();
      await presenter.getByText('Volgende',{exact:true}).click();
      assert.equal(await presenter.getByTestId('timer').innerText(),paused);
      await audience.reload();
      await audience.getByRole('heading',{name:'Probeer de interactie'}).waitFor();
      await audience.getByTestId('answer').waitFor();
      await presenter.reload();
      await presenter.getByRole('heading',{name:'Probeer de interactie'}).waitFor();
      await audience.locator('article').click();
      await audience.keyboard.press('ArrowLeft');
      await presenter.getByRole('heading',{name:'Wat ik wil bespreken'}).waitFor();
      await audience.close();
      const reopened = presenter.waitForEvent('popup');
      await presenter.getByText('Publiek openen',{exact:true}).click();
      audience = await reopened;
      await audience.getByRole('heading',{name:'Wat ik wil bespreken'}).waitFor();
      await audience.setViewportSize({width:1000,height:560});
      for (const page of [presenter, audience]) {
        await page.locator('article').evaluate(slide => {
          const extra = document.createElement('p');
          extra.textContent = 'Aanvullende inhoud onder de vouw';
          extra.style.marginTop = '1200px';
          slide.append(extra);
        });
        assert.equal(await page.locator('article').evaluate(slide =>
          slide.querySelector('ul').getBoundingClientRect().bottom <= slide.getBoundingClientRect().bottom
        ), true);
      }
      await presenter.locator('article').evaluate(slide => {
        slide.scrollTop = (slide.scrollHeight - slide.clientHeight) / 2;
      });
      await audience.waitForFunction(() => {
        const slide = document.querySelector('article');
        return Math.abs(slide.scrollTop / (slide.scrollHeight - slide.clientHeight) - 0.5) < 0.02;
      });
      await audience.locator('article').evaluate(slide => {
        slide.scrollTop = (slide.scrollHeight - slide.clientHeight) * 0.75;
      });
      await presenter.waitForFunction(() => {
        const slide = document.querySelector('article');
        return Math.abs(slide.scrollTop / (slide.scrollHeight - slide.clientHeight) - 0.75) < 0.02;
      });
      await presenter.getByText('Volgende',{exact:true}).click();
      await audience.getByRole('heading',{name:'Probeer de interactie'}).waitFor();
      assert.equal(await audience.locator('article').evaluate(slide => slide.scrollTop), 0);
      assert.equal(await presenter.locator('article').evaluate(slide => slide.scrollTop), 0);
      await presenter.getByText('Vorige',{exact:true}).click();
      await audience.getByRole('heading',{name:'Wat ik wil bespreken'}).waitFor();
      assert.equal(await audience.locator('header, nav, footer').count(), 0);
      assert.deepEqual(await audience.locator('article').evaluate(el => {
        const rect = el.getBoundingClientRect();
        return [rect.x, rect.y, rect.width === innerWidth, rect.height >= innerHeight, getComputedStyle(el).borderRadius];
      }), [0, 0, true, true, '0px']);
      await audience.keyboard.press('f');
      await audience.waitForFunction(() => !!document.fullscreenElement);
      await presenter.getByText('Volgende',{exact:true}).click();
      await presenter.getByText('Volgende',{exact:true}).click();
      await audience.getByRole('heading',{name:'Bespaarde uren per week'}).waitFor();
      const scenario = (page, name) => page.getByRole('button',{name,exact:true,pressed:true});
      await scenario(presenter, 'Basis').waitFor();
      await scenario(audience, 'Basis').waitFor();
      await audience.getByRole('button',{name:'Alternatief',exact:true}).click();
      await scenario(presenter, 'Alternatief').waitFor();
      await scenario(audience, 'Alternatief').waitFor();
      await presenter.getByText('Vorige',{exact:true}).click();
      await presenter.getByText('Volgende',{exact:true}).click();
      await scenario(presenter, 'Alternatief').waitFor();
      await presenter.reload();
      await scenario(presenter, 'Alternatief').waitFor();
      const plot = presenter.locator('.scenario-plot svg[tabindex="0"]');
      await plot.focus();
      await presenter.keyboard.press('ArrowRight');
      const tooltip = 'Week 2 · 8 uur per week';
      await presenter.locator('.ts-chart-tooltip').filter({hasText:tooltip}).waitFor();
      assert.equal(await audience.locator('.ts-chart-tooltip').filter({hasText:tooltip}).count(), 0);
      assert.match(await presenter.locator('h1').innerText(), /Bespaarde uren/);
      await presenter.locator('article').focus();
      await presenter.keyboard.press('ArrowLeft');
      await audience.getByRole('heading',{name:'Probeer de interactie'}).waitFor();
      await presenter.keyboard.press('ArrowRight');
      await audience.getByRole('heading',{name:'Bespaarde uren per week'}).waitFor();
      await audience.getByText('Bron · Illustratieve data voor deze proef',{exact:true}).waitFor();
      await presenter.screenshot({path:url.startsWith('file:')?'presenter.png':'presenter-http.png',fullPage:true});
      await audience.screenshot({path:url.startsWith('file:')?'viewer.png':'viewer-http.png',fullPage:true});
      results.push({url:url.startsWith('file:')?'file offline':'localhost',checks:['navigation from both windows','shared cursor and temporary boxes','text selection box','input arrow guard','shared reveal','three timer modes','overrun','pause','revisit','viewer refresh','presenter refresh','reopen viewer','bidirectional scrolling','fullscreen'],passed:true});
      await context.close();
    }
    writeFileSync('results.json',JSON.stringify(results,null,2));
    console.log(JSON.stringify(results,null,2));
  } finally {await browser.close(); server.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
