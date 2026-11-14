import React from 'react';
import {defineChart, lineY} from '@tanstack/charts';
import {Chart} from '@tanstack/charts/react';
import {scaleLinear} from '@tanstack/charts/scales/linear';
import {tooltip} from '@tanstack/charts/tooltip';

const scenarios = {
  basis: {label:'Basis', color:'#275bb2', values:[4, 6, 8, 9, 10, 11]},
  alternatief: {label:'Alternatief', color:'#156d57', values:[4, 8, 11, 15, 18, 22]},
};

const definitions = Object.fromEntries(Object.entries(scenarios).map(([key, scenario]) => [
  key,
  defineChart({
    marks: [lineY(scenario.values.map((hours, index) => ({week:index + 1, hours})), {
      x:'week', y:'hours', stroke:scenario.color, strokeWidth:3,
    })],
    scales: {
      x: {scale:scaleLinear().domain([1, 6]), axis:{label:'Week', ticks:{values:[1, 2, 3, 4, 5, 6]}}},
      y: {scale:scaleLinear().domain([0, 24]), grid:true, axis:{label:'Uren per week', ticks:{values:[0, 6, 12, 18, 24]}}},
    },
    keyboard:true,
    tooltip:{
      use:tooltip,
      sticky:false,
      format:({datum}) => `Week ${datum.week} · ${datum.hours} uur per week`,
    },
  }),
]));

export function ScenarioChart({scenario, onScenarioChange}) {
  const {label, color} = scenarios[scenario];
  return (
    <figure className="scenario-chart">
      <figcaption>
        <p data-selection-block="chart-description">Het alternatief bespaart in week 6 twee keer zoveel uren als het basisscenario.</p>
        <small data-selection-block="chart-source">Bron · Illustratieve data voor deze proef</small>
      </figcaption>
      <div className="scenario-controls" role="group" aria-label="Scenario kiezen">
        {Object.entries(scenarios).map(([key, option]) => (
          <button key={key} type="button" aria-pressed={scenario === key} onClick={() => onScenarioChange(key)}>
            {option.label}
          </button>
        ))}
        <span className="scenario-legend"><i style={{background:color}} aria-hidden="true"/>{label} · uren per week</span>
      </div>
      <div className="scenario-plot" data-arrow-keys>
        <Chart
          definition={definitions[scenario]}
          aspectRatio={3.4}
          initialWidth={680}
          ariaLabel={`Bespaarde uren per week · ${label}`}
          ariaDescription="Gebruik de pijltjestoetsen om de waarden per week te lezen."
        />
      </div>
    </figure>
  );
}
