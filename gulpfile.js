var gulp = require('gulp');
var _ = require('lodash');
var path = require('path');
var gulpUtil = require('gulp-util');
var mkdirp = require('mkdirp');
var Rsync = require('rsync');
var Promise = require('bluebird');
var eslint = require('gulp-eslint');
var rimraf = require('rimraf');
var zip = require('gulp-zip');
var fs = require('fs');
var spawn = require('child_process').spawn;
var minimist = require('minimist');

var pkg = require('./package.json');
var packageName = pkg.name;

// in their own sub-directory to not interfere with Gradle
var buildDir = path.resolve(__dirname, 'build/gulp');
var targetDir = path.resolve(__dirname, 'target/gulp');
var buildTarget = path.resolve(buildDir, packageName);

var include = [
  '*.json',
  'LICENSE',
  'README.md',
  'index.js',
  'init.js',
  'server',
  'node_modules',
  'public'
];
var exclude = Object.keys(pkg.devDependencies).map(function (name) {
  return path.join('node_modules', name);
});

var knownOptions = {
  string: 'kibanahomepath',
  default: { kibanahomepath: 'kibana' }
};
var options = minimist(process.argv.slice(2), knownOptions);
var kibanaPluginDir = path.resolve(__dirname, options.kibanahomepath + '/installedPlugins/' + packageName);


function syncPluginTo(dest, done) {
  mkdirp(dest, function (err) {
    if (err) return done(err);
    Promise.all(include.map(function (name) {
      var source = path.resolve(__dirname, name);
      return new Promise(function (resolve, reject) {
        var rsync = new Rsync();
        rsync
          .source(source)
          .destination(dest)
          .flags('uav')
          .recursive(true)
          .set('delete')
          .exclude(exclude)
          .output(function (data) {
            process.stdout.write(data.toString('utf8'));
          });
        rsync.execute(function (err) {
          if (err) {
            console.log(err);
            return reject(err);
          }
          resolve();
        });
      });
    }))
    .then(function () {
      done();
    })
    .catch(done);
  });
}

gulp.task('sync', function (done) {
  syncPluginTo(kibanaPluginDir, done);
});

gulp.task('lint', function (done) {
  return gulp.src([
    'index.js',
    'init.js',
    'public/**/*.js',
    'server/**/*.js',
    '!**/webpackShims/**'
  ]).pipe(eslint())
    .pipe(eslint.formatEach())
    .pipe(eslint.failOnError());
});

gulp.task('clean', function (done) {
  Promise.each([buildDir, targetDir], function (dir) {
    return new Promise(function (resolve, reject) {
      rimraf(dir, function (err) {
        if (err) return reject(err);
        resolve();
      });
    });
  }).nodeify(done);
});

gulp.task('build', ['clean'], function (done) {
  syncPluginTo(buildTarget, done);
});

gulp.task('package', ['build'], function (done) {
  return gulp.src([
      path.join(buildDir, '**', '*')
    ])
    .pipe(zip(packageName + '.zip'))
    .pipe(gulp.dest(targetDir));
});

gulp.task('dev', ['sync'], function (done) {
  gulp.watch([
    'index.js',
    'init.js',
    '*.json',
    'public/**/*',
    'server/**/*'
  ], ['sync', 'lint']);
});

gulp.task('test', ['sync'], function(done) {
  spawn('grunt', ['test:server', '--grep=Sentinl'], {
    cwd: options.kibanahomepath,
    stdio: 'inherit'
  }).on('close', done);
});

gulp.task('testdev', ['sync'], function(done) {
  spawn('grunt', ['test:dev', '--browser=Chrome'], {
    cwd: options.kibanahomepath,
    stdio: 'inherit'
  }).on('close', done);
});

gulp.task('coverage', ['sync'], function(done) {
  spawn('grunt', ['test:coverage', '--grep=Sentinl'], {
    cwd: options.kibanahomepath,
    stdio: 'inherit'
  }).on('close', done);
});
