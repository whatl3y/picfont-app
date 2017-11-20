const gulp = require('gulp')
const babel = require('gulp-babel')
const plumber = require('gulp-plumber')

const types = [ 'bin', 'libs', 'routes', 'tasks' ]

types.forEach(type => {
  gulp.task(type, function() {
    return gulp.src(`./src/${type}/**/*.js`)
      .pipe(plumber())
      .pipe(babel())
      .pipe(gulp.dest(`./${type}`))
  })
})

gulp.task('config', function() {
  return gulp.src("./src/config.js")
    .pipe(plumber())
    .pipe(babel())
    .pipe(gulp.dest("./"))
})

gulp.task('build', [ 'config' ].concat(types), function() {})
