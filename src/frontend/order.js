import Vue from 'vue';
import axios from 'axios';

import storeInstance from './store';

let stripeHandler;


const orderApp = new Vue({
    data: {
        sharedState: storeInstance.state,

        extrasSelected: {},
        extras: [],
        extrasPrice: 0,

        productPrice: 0,
        orderFee: 0,
        totalPrice: 0,
        totalPriceWithCoupon: 0,
        canOrderWithCredit: false,

        coupon: '',
        couponError: null,
        couponSuccess: false,
        couponValue: 0,

        notEnoughBalanceError: null,

        isLoading: false,
        success: null,
        error: null
    },
    mounted: function() {
        this.sharedState.extra.product_extras.forEach(extra => {
            this.extras.push(Object.assign({}, extra));
        });

        this.productPrice = this.sharedState.extra.product_price;
        this.orderFee = this.sharedState.extra.order_fee;
        this.totalPrice = Math.round(this.productPrice * (1 + this.orderFee));
        this.canOrderWithCredit = (this.sharedState.user && this.totalPrice <= this.sharedState.user.credit);

        stripeHandler = StripeCheckout.configure({
            key: this.sharedState.extra.stripe_key,
            image: this.sharedState.extra.product._primary_photo_url_smaller,
            token: function(token) {
                this.isLoading = true;
                this.handleStripePayment(token);
            }.bind(this)
        });

        if (dataLayer) {
            dataLayer.push({
                'event': 'checkout',
                'ecommerce': this.gtmCreateCheckoutData()
            });
        }
    },
    methods: {
        handleExtraSelectionChange: function() {
            let extrasPrice = 0,
                extrasSelected = {};

            this.extras.forEach(extra => {
                if (!extra.selected) {
                    return;
                }

                extrasPrice += extra.price;
                extrasSelected[extra.id] = 1;
            });

            let fee = (this.productPrice + extrasPrice) * this.orderFee;

            this.totalPrice = Math.round((this.productPrice + extrasPrice) + fee);
            this.totalPriceWithCoupon = Math.round((Math.max(this.productPrice - this.couponValue, 0) + extrasPrice) + fee);
            this.extrasSelected = extrasSelected;
            this.canOrderWithCredit = (this.sharedState.user && this.totalPrice <= this.sharedState.user.credit);
        },
        handleApplyCouponClick: function() {
            if (!this.coupon) {
                return;
            }

            let data = {
                discount: this.coupon
            };

            this.isLoading = true;
            this.couponError = null;
            this.couponValue = 0;
            axios.post('/api/order/' + this.sharedState.extra.product.id + '/verify', data).then(res => {
                this.isLoading = false;
                this.couponValue = res.data.discount_value;

                this.handleExtraSelectionChange();
            }).catch(err => {
                this.isLoading = false;
                if (err.response && err.response.status === 400) {
                    this.couponError = 'Coupon code either expired or not found';
                } else {
                    this.couponError = 'Something wrong has just happened. We already notified about this issue, and kindly ask you try this operation again a little later';
                }
            });
        },
        handleOrderClick: function() {
            if (this.isLoading || !this.sharedState.user) {
                return;
            }

            this.notEnoughBalanceError = null;

            if (this.totalPrice > this.sharedState.user.credit) {
                this.notEnoughBalanceError = true;
                return;
            }

            let data = {
                extras: Object.keys(this.extrasSelected)
            };

            if (this.couponValue) {
                data.discount = this.coupon;
            }

            let fnCallback = url => {
                // Redirect user to the order page
                window.location.href = url;
            };

            this.isLoading = true;
            axios.post('/api/order/' + this.sharedState.extra.product.id, data).then(res => {
                if (dataLayer) {
                    dataLayer.push({
                        'event': 'purchase',
                        'ecommerce': this.gtmCreatePurchaseData(res.data),
                        'eventCallback': fnCallback.bind(null, res.data._url)
                    });
                } else {
                    fnCallback(res.data._url)
                }
            }).catch(err => {
                this.isLoading = false;
                // TODO
                this.error = 'Something bad has just happened. We kindly ask you to contact support for faster resolution of this issue';
            });
        },
        openStripeWindow: function() {
            stripeHandler && stripeHandler.open({
                name: 'SelfMarket',
                description: 'I will ' + this.sharedState.extra.product.title,
                email: this.sharedState.user && this.sharedState.user.email,
                amount: this.totalPriceWithCoupon
            });
        },
        handleStripePayment: function(token) {
            let data = {
                stripeToken: token.id,
                stripeEmail: token.email,
                extras: Object.keys(this.extrasSelected)
            };

            let fnCallback = (url) => {
                if (this.sharedState.user) {
                    // Redirect user to the order page
                    window.location.href = url;
                } else {
                    // For unauthorized user let's just show a message
                    this.success = 'Thank you for your order! We sent you email with instructions on how to access personal account page';
                }
            };

            Vue.nextTick(function() {
                this.isLoading = true;
                axios.post('/api/order/' + this.sharedState.extra.product.id, data).then(res => {
                    if (dataLayer) {
                        dataLayer.push({
                            'event': 'purchase',
                            'ecommerce': this.gtmCreatePurchaseData(),
                            'eventCallback': fnCallback.bind(null, res.data._url)
                        });
                    } else {
                        fnCallback(res.data._url);
                    }
                }).catch(res => {
                    this.isLoading = false;
                    // TODO
                    this.error = 'Something bad has just happened. We kindly ask you to contact support for faster resolution of this issue';
                });
            }.bind(this));
        },
        gtmCreateCheckoutData: function() {
            return {
                'checkout': {
                    'actionField': {'step': 1},
                    'products': [{
                      'name': this.sharedState.extra.product.title,
                      'id': this.sharedState.extra.product.id,
                      'price': (this.totalPriceWithCoupon / 100).toFixed(2),
                      'brand': this.sharedState.extra.product._seller,
                      'category': this.sharedState.extra.product.category_id,
                      'quantity': 1
                    }]
                }
            };
        },
        gtmCreatePurchaseData: function(data) {
            return {
                'purchase': {
                    'actionField': {
                        'id': data.id,
                        'revenue': (this.totalPriceWithCoupon / 100).toFixed(2),
                        'coupon': this.coupon
                    },
                    'products': [{
                      'name': this.sharedState.extra.product.title,
                      'id': this.sharedState.extra.product.id,
                      'price': (this.totalPriceWithCoupon / 100).toFixed(2),
                      'brand': this.sharedState.extra.product._seller,
                      'category': this.sharedState.extra.product.category_id,
                      'quantity': 1
                    }]
                }
            };
        }
    }
});


export default orderApp;
