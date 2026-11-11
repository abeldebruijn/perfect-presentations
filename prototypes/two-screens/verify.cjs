const {chromium} = require('playwright');
const {createServer} = require('node:http');
const {readFileSync,writeFileSync} = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const server = createServer((req,res) => {res.setHeader('Content-Type','text/html'); res.end(readFileSync('prototype.html'));});
  const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const results = [];
  try {
    for (const url of [`file://${process.cwd()}/prototype.html`, `http://127.0.0.1:${server.address().port}/`]) {
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
      await presenter.screenshot({path:url.startsWith('file:')?'presenter.png':'presenter-http.png',fullPage:true});
      await audience.screenshot({path:url.startsWith('file:')?'viewer.png':'viewer-http.png',fullPage:true});
      results.push({url:url.startsWith('file:')?'file offline':'localhost',checks:['navigation from both windows','input arrow guard','shared reveal','three timer modes','overrun','pause','revisit','viewer refresh','presenter refresh','reopen viewer','fullscreen'],passed:true});
      await context.close();
    }
    writeFileSync('results.json',JSON.stringify(results,null,2));
    console.log(JSON.stringify(results,null,2));
  } finally {await browser.close(); server.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
