var gulp = require('gulp'),
    rename = require('gulp-rename'),
    uglify = require('gulp-uglify'),
    minifyCss = require('gulp-minify-css');

gulp.task('uglify-js', function () {
    return gulp.src('static/js/linkingwords-client.js')
        .pipe(uglify())
        .pipe(rename({
            suffix: '.min'
        }))
        .pipe(gulp.dest('static/js'));
});

gulp.task('minify-css', function () {
    return gulp.src('static/css/main.css')
        .pipe(minifyCss({
            compatibility: 'ie8'
        }))
        .pipe(rename({
            suffix: '.min'
        }))
        .pipe(gulp.dest('static/css'));
});

gulp.task('default', ['uglify-js', 'minify-css']);
