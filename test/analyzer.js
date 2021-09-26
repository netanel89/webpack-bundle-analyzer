const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const del = require('del');
const childProcess = require('child_process');
const puppeteer = require('puppeteer');

let browser;

describe('Analyzer', function () {
  jest.setTimeout(15000);

  beforeAll(async function () {
    browser = await puppeteer.launch();
    del.sync(`${__dirname}/output`);
  });

  beforeEach(async function () {
    jest.setTimeout(15000);
  });

  afterEach(function () {
    del.sync(`${__dirname}/output`);
  });

  afterAll(async function () {
    await browser.close();
  });

  it('should support stats files with all the information in `children` array', async function () {
    generateReportFrom('with-children-array.json');
    await expectValidReport();
  });

  it('should generate report containing worker bundles', async function () {
    generateReportFrom('with-worker-loader/stats.json');
    const chartData = await getChartData();
    expect(chartData[1]).to.containSubset({
      label: 'bundle.worker.js'
    });
  });

  it('should generate report for array webpack.config.js', async function () {
    generateReportFrom('with-array-config/stats.json');
    const chartData = await getChartData();
    expect(chartData).to.have.lengthOf(2);
    expect(chartData[0]).to.containSubset({
      label: 'config-1-main.js'
    });
    expect(chartData[1]).to.containSubset({
      label: 'config-2-main.js'
    });
  });

  it('should generate report when worker bundles have dynamic imports', async function () {
    generateReportFrom('with-worker-loader-dynamic-import/stats.json');
    const chartData = await getChartData();
    expect(chartData[1]).to.containSubset({
      label: '1.bundle.worker.js'
    });
  });

  it('should support stats files with modules inside `chunks` array', async function () {
    generateReportFrom('with-modules-in-chunks/stats.json');
    const chartData = await getChartData();
    expect(chartData).to.containSubset(
      require('./stats/with-modules-in-chunks/expected-chart-data')
    );
  });

  it('should record accurate byte lengths for sources with special chars', async function () {
    generateReportFrom('with-special-chars/stats.json');
    const chartData = await getChartData();
    expect(chartData).to.containSubset(
      require('./stats/with-special-chars/expected-chart-data')
    );
  });

  it('should support bundles with invalid dynamic require calls', async function () {
    generateReportFrom('with-invalid-dynamic-require.json');
    await expectValidReport({statSize: 136});
  });

  it('should use information about concatenated modules generated by webpack 4', async function () {
    generateReportFrom('with-module-concatenation-info/stats.json');
    const chartData = await getChartData();
    expect(chartData[0].groups[0]).to.containSubset(
      require('./stats/with-module-concatenation-info/expected-chart-data')
    );
  });

  it("should not filter out modules that we could't find during parsing", async function () {
    generateReportFrom('with-missing-parsed-module/stats.json');
    const chartData = await getChartData();
    let unparsedModules = 0;
    forEachChartItem(chartData, item => {
      if (typeof item.parsedSize !== 'number') {
        unparsedModules++;
      }
    });
    expect(unparsedModules).to.equal(1);
  });

  it('should gracefully parse invalid chunks', async function () {
    generateReportFrom('with-invalid-chunk/stats.json');
    const chartData = await getChartData();
    const invalidChunk = _.find(chartData, {label: 'invalid-chunk.js'});
    expect(invalidChunk.groups).to.containSubset([
      {
        id: 1,
        label: 'invalid.js',
        path: './invalid.js',
        statSize: 24
      }
    ]);
    expect(invalidChunk.statSize).to.equal(24);
    expect(invalidChunk.parsedSize).to.equal(30);
  });

  it('should gracefully process missing chunks', async function () {
    generateReportFrom('with-missing-chunk/stats.json');
    const chartData = await getChartData();
    const invalidChunk = _.find(chartData, {label: 'invalid-chunk.js'});
    expect(invalidChunk).to.exist;
    expect(invalidChunk.statSize).to.equal(24);
    forEachChartItem([invalidChunk], item => {
      expect(typeof item.statSize).to.equal('number');
      expect(item.parsedSize).to.be.undefined;
    });
    const validChunk = _.find(chartData, {label: 'valid-chunk.js'});
    forEachChartItem([validChunk], item => {
      expect(typeof item.statSize).to.equal('number');
      expect(typeof item.parsedSize).to.equal('number');
    });
  });

  it('should gracefully process missing chunks', async function () {
    generateReportFrom('with-missing-module-chunks/stats.json');
    const chartData = await getChartData();
    const invalidChunk = _.find(chartData, {label: 'invalid-chunk.js'});
    expect(invalidChunk).to.exist;
    expect(invalidChunk.statSize).to.equal(568);
    forEachChartItem([invalidChunk], item => {
      expect(typeof item.statSize).to.equal('number');
      expect(item.parsedSize).to.be.undefined;
    });
    const validChunk = _.find(chartData, {label: 'valid-chunk.js'});
    forEachChartItem([validChunk], item => {
      expect(typeof item.statSize).to.equal('number');
      expect(typeof item.parsedSize).to.equal('number');
    });
  });

  it('should support stats files with js modules chunk', async function () {
    generateReportFrom('with-modules-chunk.json');
    await expectValidReport({bundleLabel: 'bundle.mjs'});
  });

  it('should properly parse extremely optimized bundle from webpack 5', async function () {
    generateReportFrom('extremely-optimized-webpack-5-bundle/stats.json');
    const chartData = await getChartData();
    expect(chartData).to.containSubset(
      require('./stats/extremely-optimized-webpack-5-bundle/expected-chart-data')
    );
  });

  it('should properly parse webpack 5 bundle with single entry', async function () {
    generateReportFrom('webpack-5-bundle-with-single-entry/stats.json');
    const chartData = await getChartData();
    expect(chartData).to.containSubset(
      require('./stats/webpack-5-bundle-with-single-entry/expected-chart-data')
    );
  });

  it('should properly parse webpack 5 bundle with multiple entries', async function () {
    generateReportFrom('webpack-5-bundle-with-multiple-entries/stats.json');
    const chartData = await getChartData();
    expect(chartData).to.containSubset(
      require('./stats/webpack-5-bundle-with-multiple-entries/expected-chart-data')
    );
  });

  it('should support generating JSON output for the report', async function () {
    generateJSONReportFrom('with-modules-in-chunks/stats.json');

    const chartData = require(path.resolve(__dirname, 'output/report.json'));
    expect(chartData).to.containSubset(require('./stats/with-modules-in-chunks/expected-chart-data'));
  });

  it('should support stats files with non-asset asset', async function () {
    generateReportFrom('with-non-asset-asset/stats.json');
    await expectValidReport({bundleLabel: 'bundle.js'});
  });

  describe('options', function () {
    describe('title', function () {
      it('should take the --title option', async function () {
        const reportTitle = 'A string report title';
        generateReportFrom('with-modules-chunk.json', `--title "${reportTitle}"`);

        const generatedReportTitle = await getTitleFromReport();

        expect(generatedReportTitle).to.equal(reportTitle);
      });
      it('should take the -t option', async function () {
        const reportTitle = 'A string report title';

        generateReportFrom('with-modules-chunk.json', `-t "${reportTitle}"`);

        const generatedReportTitle = await getTitleFromReport();

        expect(generatedReportTitle).to.equal(reportTitle);
      });
      it('should use a suitable default title', async function () {
        generateReportFrom('with-modules-chunk.json');

        const generatedReportTitle = await getTitleFromReport();

        expect(generatedReportTitle).to.match(/^webpack-bundle-analyzer \[.* at \d{2}:\d{2}\]/u);
      });
    });
  });
});

function generateJSONReportFrom(statsFilename) {
  childProcess.execSync(`../lib/bin/analyzer.js -m json -r output/report.json stats/${statsFilename}`, {
    cwd: __dirname
  });
}

function generateReportFrom(statsFilename, additionalOptions = '') {
  childProcess.execSync(
    `../lib/bin/analyzer.js ${additionalOptions} -m static -r output/report.html -O stats/${statsFilename}`,
    {
      cwd: __dirname
    });
}

async function getTitleFromReport() {
  const page = await browser.newPage();
  await page.goto(`file://${__dirname}/output/report.html`);
  return await page.title();
}

async function getChartData() {
  const page = await browser.newPage();
  await page.goto(`file://${__dirname}/output/report.html`);
  return await page.evaluate(() => window.chartData);
}

function forEachChartItem(chartData, cb) {
  for (const item of chartData) {
    cb(item);

    if (item.groups) {
      forEachChartItem(item.groups, cb);
    }
  }
}

async function expectValidReport(opts) {
  const {
    bundleLabel = 'bundle.js',
    statSize = 141
  } = opts || {};

  expect(fs.existsSync(`${__dirname}/output/report.html`)).to.be.true;
  const chartData = await getChartData();
  expect(chartData[0]).to.containSubset({
    label: bundleLabel,
    statSize
  });
}
