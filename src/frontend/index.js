import Promise from 'promise-polyfill';
import Vue from 'vue';
import axios from 'axios';
import Raven from 'raven-js';
import RavenVue from 'raven-js/plugins/vue';

import storeInstance from './store';
import messagingInstance from '../shared/messaging';
import headerApp from './header';
import mainApp from './main';
import productApp from './product';
import orderApp from './order';
import userApp from './user';
import becomeSellerApp from './becomeSeller';
import './style/index.scss';


// Installing Promise polyfill
if (!window.Promise) {
    window.Promise = Promise;
}

// Add custom header to every XHR request
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';


if (window.SM_BOOTSTRAP_DATA) {
    storeInstance.bootstrap(window.SM_BOOTSTRAP_DATA);

    if (storeInstance.state.config.sentry) {
        // Install Raven
        
        let raven = Raven.config(
            storeInstance.state.config.sentry.dsn, { debug: true }
        ).addPlugin(RavenVue, Vue).install();

        window.onunhandledrejection = Promise._unhandledRejectionFn = function(evt) {
            Raven.captureException(evt.reason);
        };
    }

    if (storeInstance.state.user && storeInstance.state.config.messaging) {
        messagingInstance.init(storeInstance.state.config.messaging.server, storeInstance.state.user);
    }
}


headerApp.$mount('#sm-header');

if (document.getElementById('sm-main')) {
    mainApp.$mount('#sm-main');
}

if (document.getElementById('sm-product')) {
    productApp.$mount('#sm-product');
}

if (document.getElementById('sm-order')) {
    orderApp.$mount('#sm-order');
}

if (document.getElementById('sm-user')) {
    userApp.$mount('#sm-user');
}

if (document.getElementById('sm-become-seller')) {
    becomeSellerApp.$mount('#sm-become-seller');
}

if (document.getElementById('sm-cookies-notification')) {
    let cookieAccepted = null;
    try { cookieAccepted = localStorage['cookAcc']; } catch (e) {}

    if (!cookieAccepted) {
        cookieAccepted = /cookAcc=1/.test(document.cookie);
    }

    if (!cookieAccepted) {
        new Vue({
            el: '#sm-cookies-notification',
            data: { show: true },
            methods: {
                handleAccept: function() {
                    this.show = false;
                    try { localStorage['cookAcc'] = 1; } catch (e) {}
                    document.cookie = 'cookAcc=1; expires=Mon, 20 Mar 2034 13:00:00 UTC; path=/';
                }
            }
        });
    }
}

if (document.getElementById('sm-become-seller-landing')) {
    new Vue({
        el: '#sm-become-seller-landing',
        data: {
            faqOpened: {}
        },
        methods: {
            handleOpenSignupModal: function() {
                storeInstance.bus.$emit('header.openSignupModal');
            },
            handleOpenLoginModal: function() {
                storeInstance.bus.$emit('header.openLoginModal');
            }
        }
    });
}

if (document.getElementById('sm-contact-us')) {
    new Vue({
        el: '#sm-contact-us',
        data: {
            reason: '',
            email: '',
            comments: '',
            loading: false,
            sent: false
        },
        methods: {
            handleSendClick: function() {
                this.loading = true;
                axios.post('/api/contact', { reason: this.reason, email: this.email, comments: this.comments }).then(res => {
                    this.loading = false;
                    this.sent = true;
                }).catch(err => {
                    this.loading = false;
                    // TODO
                });
            }
        }
    });
}
