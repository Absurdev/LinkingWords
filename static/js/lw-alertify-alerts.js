/* global alertify */

if (!alertify.lwAlert) {
    alertify.dialog('lwAlert', function factory() {
        return {
            main: function (title, message) {
                this.title = title;
                this.message = message;
            },
            setup: function () {
                return {
                    buttons: [{
                        text: "Ok",
                        key: 27
                    }],
                    focus: {
                        element: 0
                    },
                    options: {
                        transition: 'fade'
                    }
                };
            },
            prepare: function () {
                this.setContent(this.message);
                this.set({
                    title: this.title
                });
            }
        };
    }, true);
}

if (!alertify.lwSmallScreenAlert) {
    alertify.dialog('lwSmallScreenAlert', function factory() {
        return {
            main: function (title, message) {
                this.title = title;
                this.message = message;
            },
            setup: function () {
                return {
                    buttons: [{
                        text: "Ok",
                        key: 27
                    }],
                    focus: {
                        element: 0
                    },
                    options: {
                        resizable: false,
                        maximizable: false,
                        startMaximized: true,
                        transition: 'fade'
                    }
                };
            },
            prepare: function () {
                this.setContent(this.message);
                this.set({
                    title: this.title
                });
            }
        };
    }, true);
}