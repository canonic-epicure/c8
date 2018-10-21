const Exclude = require('test-exclude')
const libCoverage = require('istanbul-lib-coverage')
const libReport = require('istanbul-lib-report')
const reports = require('istanbul-reports')
const { readdirSync, readFileSync } = require('fs')
const { resolve, isAbsolute } = require('path')
const { mergeProcessCovs } = require('@c88/v8-coverage')
const v8toIstanbul = require('v8-to-istanbul')

class Report {
  constructor ({
    exclude,
    include,
    reporter,
    tempDirectory,
    watermarks,
    resolve,
    omitRelative
  }) {
    this.reporter = reporter
    this.tempDirectory = tempDirectory
    this.watermarks = watermarks
    this.resolve = resolve
    this.exclude = Exclude({
      exclude: exclude,
      include: include
    })
    this.omitRelative = omitRelative
  }
  run () {
    const map = this._getCoverageMapFromAllCoverageFiles()
    var context = libReport.createContext({
      dir: './coverage',
      watermarks: this.watermarks
    })

    const tree = libReport.summarizers.pkg(map)

    this.reporter.forEach(function (_reporter) {
      tree.visit(reports.create(_reporter), context)
    })
  }

  _getCoverageMapFromAllCoverageFiles () {
    const v8ProcessCov = this._getMergedProcessCov()

    const map = libCoverage.createCoverageMap({})

    for (const v8ScriptCov of v8ProcessCov.result) {
      try {
        const path = resolve(this.resolve, v8ScriptCov.url)
        const script = v8toIstanbul(path)
        script.applyCoverage(v8ScriptCov.functions)
        map.merge(script.toIstanbul())
      } catch (err) {
        console.warn(`file: ${v8ScriptCov.url} error: ${err.stack}`)
      }
    }

    return map
  }

  /**
   * Returns the merged V8 process coverage.
   *
   * The result is computed from the individual process coverages generated
   * by Node. It represents the sum of their counts.
   *
   * @return {ProcessCov} Merged V8 process coverage.
   * @private
   */
  _getMergedProcessCov () {
    const v8ProcessCovs = []
    for (const v8ProcessCov of this._loadReports()) {
      v8ProcessCovs.push(this._filterProcessCov(v8ProcessCov))
    }
    return mergeProcessCovs(v8ProcessCovs)
  }

  /**
   * Returns the list of V8 process coverages generated by Node.
   *
   * @return {ProcessCov[]} Process coverages generated by Node.
   * @private
   */
  _loadReports () {
    const files = readdirSync(this.tempDirectory)

    return files.map((f) => {
      try {
        return JSON.parse(readFileSync(
          resolve(this.tempDirectory, f),
          'utf8'
        ))
      } catch (err) {
        console.warn(`${err.stack}`)
      }
    })
  }

  /**
   * Returns a filtered process coverage.
   *
   * The result is a copy of the input, with script coverages filtered based
   * on their `url` and the current inclusion rules.
   * There is no deep cloning.
   *
   * @param v8ProcessCov V8 process coverage to filter.
   * @return {v8ProcessCov} Filtered V8 process coverage.
   * @private
   */
  _filterProcessCov (v8ProcessCov) {
    const result = []
    for (const v8ScriptCov of v8ProcessCov.result) {
      if (this.exclude.shouldInstrument(v8ScriptCov.url) &&
        (!this.omitRelative || isAbsolute(v8ScriptCov.url))) {
        result.push(v8ScriptCov)
      }
    }
    return { result }
  }
}

module.exports = function (opts) {
  const report = new Report(opts)
  report.run()
}