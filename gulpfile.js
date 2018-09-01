'use strict';

var _ = require('lodash');
var argv = require('yargs').argv;
var gulp = require('gulp');
var gutil = require('gulp-util');
var connect = require('gulp-connect');
var path = require('path');
var webpack = require('webpack');
var webpackStream = require('webpack-stream');
var uglify = require('gulp-uglify');
var clean = require('gulp-clean');
var KarmaServer = require('karma').Server;
var karmaConfMaker = require('./karma.conf.maker');
var opens = require('open');
var webpackConfig = require('./webpack.conf');
var helpers = require('./gulpHelpers');
var del = require('del');
var gulpDocumentation = require('gulp-documentation');
var concat = require('gulp-concat');
var header = require('gulp-header');
var footer = require('gulp-footer');
var replace = require('gulp-replace');
var shell = require('gulp-shell');
var optimizejs = require('gulp-optimize-js');
var eslint = require('gulp-eslint');
var gulpif = require('gulp-if');
var sourcemaps = require('gulp-sourcemaps');
var through = require('through2');
var fs = require('fs');
var jsEscape = require('gulp-js-escape');

var prebid = require('./package.json');
var dateString = 'Updated : ' + (new Date()).toISOString().substring(0, 10);
var banner = '/* <%= prebid.name %> v<%= prebid.version %>\n' + dateString + ' */\n';
var analyticsDirectory = '../analytics';
var port = 9999;

// Tasks
gulp.task('default', ['webpack']);

gulp.task('clean', function () {
  return gulp.src(['build'], {
    read: false
  })
    .pipe(clean());
});

function nodeBundle(modules) {
  return new Promise((resolve, reject) => {
    runGulpTask('webpack')
      .then(() => {
        bundle(false, modules)
          .on('error', (err) => {
            console.log(err)
            reject(err);
          })
          .pipe(through.obj(function(file, enc, done) {
            resolve(file.contents.toString(enc));
            done();
          }));
      })
      .catch(reject);
  });
}

// these modules must be explicitly listed in --modules to be included in the build, won't be part of "all" modules
var explicitModules = [
  'pre1api'
];

function bundle(dev, moduleArr) {
  var modules = moduleArr || helpers.getArgModules(),
    allModules = helpers.getModuleNames(modules);

  if (modules.length === 0) {
    modules = allModules.filter(module => !explicitModules.includes(module));
  } else {
    var diff = _.difference(modules, allModules);
    if (diff.length !== 0) {
      throw new gutil.PluginError({
        plugin: 'bundle',
        message: 'invalid modules: ' + diff.join(', ')
      });
    }
  }

  var entries = [helpers.getBuiltPrebidCoreFile(dev)].concat(helpers.getBuiltModules(dev, modules));

  var outputFileName = argv.bundleName ? argv.bundleName : 'prebid.js';

  // change output filename if argument --tag given
  if (argv.tag && argv.tag.length) {
    outputFileName = outputFileName.replace(/\.js$/, `.${argv.tag}.js`);
  }

  return gulp.src(entries)
    .pipe(concat(outputFileName))
    .pipe(gulpif(!argv.manualEnable, footer('\n<%= global %>.processQueue();', {
      global: prebid.globalVarName
    })));
}

// Workaround for incompatibility between Karma & gulp callbacks.
// See https://github.com/karma-runner/gulp-karma/issues/18 for some related discussion.
function newKarmaCallback(done) {
  return function (exitCode) {
    if (exitCode) {
      done(new Error('Karma tests failed with exit code ' + exitCode));
    } else {
      if (argv.browserstack) {
        process.exit(0);
      } else {
        done();
      }
    }
  }
}

gulp.task('webpack', ['clean'], function () {
  var cloned = _.cloneDeep(webpackConfig);

  delete cloned.devtool;

  var externalModules = helpers.getArgModules();

  const analyticsSources = helpers.getAnalyticsSources(analyticsDirectory);
  const moduleSources = helpers.getModulePaths(externalModules);

  return gulp.src([].concat(moduleSources, analyticsSources, 'src/prebid.js'))
    .pipe(helpers.nameModules(externalModules))
    .pipe(webpackStream(cloned, webpack))
    .pipe(replace('$prebid.version$', prebid.version))
    .pipe(uglify())
    .pipe(gulpif(file => file.basename === 'prebid-core.js', header(banner, { prebid: prebid })))
    .pipe(optimizejs())
    .pipe(gulp.dest('build/dist'))
    .pipe(connect.reload());
});

module.exports = nodeBundle;
