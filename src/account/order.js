import Vue from 'vue';
import { modal } from 'vue-strap';
import fecha from 'fecha';
import axios from 'axios';
import VueFileUpload from 'vue-upload-component';

import Countdown from './components/countdown';
import Spinner from '../shared/components/spinner';
import storeInstance from '../frontend/store';
import messagingInstance from '../shared/messaging';
import { formatTimespanFromNow, checkPatterns } from '../shared/utils';


const HIDE_MESSAGE_TYPES = ['new_order', 'order_accepted', 'order_dispute'];


const accountOrderSellerApp = new Vue({
    components: {
        Countdown,
        Spinner,
        modal,
        FileUpload: VueFileUpload
    },
    data: {
        sharedState: storeInstance.state,

        messagesLoading: true,
        messages: [],

        newMessage: '',
        newMessageLoading: false,

        messageIncludedBlockWord: {
            pay: false,
            skype: false,
            phone: false
        },

        buyerDisplayName: '',
        sellerDisplayName: '',
        buyerPhoto: '',
        sellerPhoto: '',
        buyerLastSeen: '',
        sellerLastSeen: '',

        order: null,
        orderCreatedDate: null,
        orderProductHasRequirements: false,
        orderRequirements: [],

        isLoading: false,

        attachError: null,
        attachUploading: false,
        attachUploads: [],
        attachUploadEvents: {},

        sellerRejectPopup: false,
        sellerRejectModal: false,
        sellerRejectReason: '',

        sellerDeliverModal: false,
        sellerDeliverError: null,
        sellerDeliverText: '',
        sellerDeliverUploads: [],
        sellerDeliverUploading: false,
        sellerDeliverUploadEvents: null,

        deliveryVoteLoading: {},
        deliveryVote: {}
    },
    watch: {
        newMessage: function(str) {
            this.messageIncludedBlockWord = checkPatterns(str);
        }
    },
    mounted: function() {
        this.order = this.sharedState.extra.order;
        this.orderCreatedDate = formatTimespanFromNow(this.order.created_on);

        this.orderProductHasRequirements = this.sharedState.extra.product_requirements && this.sharedState.extra.product_requirements.length;
        this.orderHasRequirements = this.sharedState.extra.order_requirements && this.sharedState.extra.order_requirements.length;

        // this.buyerDisplayName = (this.sharedState.extra.buyer.id === this.sharedState.user.id) ? 'You' : this.sharedState.extra.buyer.username;
        // this.sellerDisplayName = (this.sharedState.extra.seller.id === this.sharedState.user.id) ? 'You' : this.sharedState.extra.seller.username;

        this.buyerDisplayName = this.sharedState.extra.buyer.username;
        this.sellerDisplayName = this.sharedState.extra.seller.username;

        this.sellerPhoto = this.sharedState.extra.seller._photo_url;
        this.buyerPhoto = this.sharedState.extra.buyer._photo_url;

        this.buyerLastSeen = formatTimespanFromNow(this.sharedState.extra.buyer.last_logged_on, false);
        this.sellerLastSeen = formatTimespanFromNow(this.sharedState.extra.seller.last_logged_on, false);

        if (this.orderHasRequirements) {
            this.orderRequirements = this.sharedState.extra.order_requirements.map(requirement => {
                if (Array.isArray(requirement.reply)) {
                    return {
                        reply: requirement.reply.map(attachment => {
                            attachment._url = storeInstance.urlFor('order_' + this.sharedState.extra.mode + '_attachment', [ attachment.attachmentId, attachment.filename ]);
                            return attachment;
                        })
                    };
                }

                return requirement;
            });
        }

        let messagingReadyInterval = setInterval(() => {
            if (messagingInstance.isAuthenticated) {
                clearInterval(messagingReadyInterval);
                this.fetchMessages();

                this.initAttachments();
            }
        }, 100);
    },
    methods: {
        fetchMessages: function() {
            this.messagesLoading = true;
            messagingInstance.loadHistory('order:' + this.order.id, {}, (err, data) => {
                this.messagesLoading = false;

                if (err) {
                    // TODO
                    return;
                }

                this.messages = data.map(this.prepareMessage, this)
                                    .filter(message => HIDE_MESSAGE_TYPES.indexOf(message.type) === -1)
                                    .reverse();


                messagingInstance.subscribeToRoom('order:' + this.order.id, this.handleIncomingMessage.bind(this));

                if (this.sharedState.extra.mode === 'seller') {
                    // Right now updates are only supported for order_sent messages (update on rating of deliverable)
                    //  so we subscribe only seller
                    messagingInstance.subscribeToRoomUpdates('order:' + this.order.id, this.handleMessageUpdate.bind(this));
                }
            });
        },
        handleIncomingMessage: function(body) {
            if (['order_accepted', 'order_sent', 'order_cancelled', 'order_rejected'].indexOf(body.type) !== -1) {
                this.order && this.updateOrder();
            }

            if (HIDE_MESSAGE_TYPES.indexOf(body.type) !== -1) {
                return;
            }
            
            this.messages.push(this.prepareMessage(body));
        },
        handleMessageUpdate: function(body) {
            if (body.meta.deliverable) {
                // Do not go over all messages in array, just set the same object with temp. ratings as for buyer
                this.$set(this.deliveryVote, body.meta.deliverable.id, body.meta.deliverable.rating);
            }
        },
        handleCancelOrderClick: function() {
            this.isLoading = true;
            axios.post('/api/account/buyer/orders/' + this.order.id + '/cancel').then(resp => {
                this.order = resp.data;
                this.isLoading = false;
            }).catch(err => {
                this.isLoading = false;
                // TODO:
            });
        },
        handleAcceptOrderClick: function() {
            this.isLoading = true;
            axios.post('/api/account/seller/orders/' + this.order.id + '/accept').then(resp => {
                this.order = resp.data;
                this.isLoading = false;
            }).catch(err => {
                this.isLoading = false;
                // TODO:
            });
        },
        handleRejectOrderClick: function() {
            this.sellerRejectReason = '';
            this.sellerRejectModal = true;
        },
        handleRejectOrder: function() {
            this.isLoading = true;

            let data = {
                reason: this.sellerRejectReason
            };

            axios.post('/api/account/seller/orders/' + this.order.id + '/reject', data).then(resp => {
                this.order = resp.data;
                this.sellerRejectModal = false;
                this.isLoading = false;
            }); // TODO: handle error
        },
        handleDeliverClick: function() {
            if (!this.sellerDeliverUploadEvents) {
                this.sellerDeliverUploadEvents = {
                    add: this.handleSellerDeliveryUploadAdd.bind(this),
                    after: this.handleSellerDeliveryUploadAfter.bind(this)
                };
            }

            this.sellerDeliverModal = true;
        },
        handleDeliver: function() {
            let data = {
                text: this.sellerDeliverText,
                files: this.sellerDeliverUploads.map(file => ({ attachmentId: file.response.attachmentId, filename: file.response.filename, size: file.size }))
            };

            this.isLoading = true;
            axios.post('/api/account/seller/orders/' + this.order.id + '/deliver', data).then(resp => {
                this.order = resp.data;
                this.isLoading = false;

                this.sellerDeliverModal = false;
                this.sellerDeliverText = '';
                this.sellerDeliverUploads = [];
            }).catch(err => {
                this.isLoading = false;
                
                if (err.response.data.error && err.response.data.error.message) {
                    this.sellerDeliverError = err.response.data.error.message;
                }
            });
        },
        handleCompleteClick: function() {
            this.isLoading = true;
            axios.post('/api/account/buyer/orders/' + this.order.id + '/complete').then(resp => {
                this.order = resp.data;
                this.isLoading = false;
            }).catch(err => {
                this.isLoading = false;
                // TODO:
            });
        },
        handleRevisionClick: function() {
            this.isLoading = true;
            axios.post('/api/account/buyer/orders/' + this.order.id + '/revision').then(resp => {
                this.order = resp.data;
                this.isLoading = false;
            }).catch(err => {
                this.isLoading = false;
                // TODO:
            });
        },
        handleResolveDisputeClick: function() {
            this.isLoading = true;
            axios.post('/api/account/' + this.sharedState.extra.mode + '/orders/' + this.order.id + '/resolve').then(resp => {
                this.order = resp.data;
                this.isLoading = false;
            }).catch(err => {
                this.isLoading = false;
            });
        },
        handleCancelDisputeClick: function() {
            this.isLoading = true;
            axios.post('/api/account/' + this.sharedState.extra.mode + '/orders/' + this.order.id + '/cancel_dispute').then(resp => {
                this.order = resp.data;
                this.isLoading = false;
            }).catch(err => {
                this.isLoading = false;
            });
        },
        handleDeliverableVote: function(id, rating) {
            this.$set(this.deliveryVoteLoading, id, true);
            axios.post('/api/account/buyer/orders/' + this.order.id + '/deliverable/' + id + '/vote', { rating: rating }).then(resp => {
                this.$set(this.deliveryVote, id, rating);
                this.$set(this.deliveryVoteLoading, id);
            }).catch(err => {
                this.$set(this.deliveryVoteLoading, id);
            });
        },

        updateOrder: function() {
            this.isLoading = true;
            axios.get('/api/account/' + this.sharedState.extra.mode + '/orders/' + this.order.id).then(resp => {
                this.order = resp.data;
                this.isLoading = false;
            }).catch(err => {
                this.isLoading = false;
                // TODO:
            });
        },

        handleMessageSend: function() {
            if (this.newMessageLoading || this.messagesLoading) {
                return;
            }

            if (!this.newMessage.length) {
                return;
            }

            let meta = {
                notify: true
            };

            if (this.attachUploads.length) {
                meta.attachments = this.attachUploads.map(file => Object.assign({ size: file.size }, file.response ));
            }

            try {
                messagingInstance.sendMessage('order:' + this.order.id, this.newMessage, meta);
                this.newMessage = '';
                this.attachError = null;
                this.attachUploads = [];
            } catch (e) {
                // TODO
            }
        },

        prepareMessage: function(message) {
            message._create_date_display = formatTimespanFromNow(message.date);

            if (this.sharedState.extra.buyer.id === message.user) {
                message._sender_display = this.buyerDisplayName;
                message._sender_photo = this.sharedState.extra.buyer._photo_url;
                message._buyer = true;
            } else if (this.sharedState.extra.seller.id === message.user) {
                message._sender_display = this.sellerDisplayName;
                message._sender_photo = this.sharedState.extra.seller._photo_url;
            } else {
                message._sender_display = 'System'; // TODO
            }

            if (message.type === 'order_sent' && message.meta && message.meta.deliverable) {
                // Prepare deliverable URLs

                message.meta.deliverable.files = message.meta.deliverable.files.map(file => {
                    file._url = storeInstance.urlFor('order_' + this.sharedState.extra.mode + '_attachment', [ file.attachmentId, file.filename ]);
                    return file;
                });
            }

            return message;
        },

        initAttachments: function() {
            this.attachUploadEvents = {
                add: this.handleAttachUploadAdd.bind(this),
                after: this.handleAttachUploadAfter.bind(this)
            };
        },
        handleAttachUploadAdd: function(file, component) {
            this.attachError = null;
            this.attachUploading = true;
            component.active = true;
        },
        handleAttachUploadAfter: function(file, component) {
            this.attachUploading = false;

            if (file.error || !file.response || !file.response.attachmentId) {
                component.remove(file.id);

                if (file.response && file.response.error) {
                    this.attachError = file.response.error;
                }

                return;
            }
        },
        handleAttachDelete: function(file) {
            if (this.attachUploading) {
                return;
            }

            let data = {
                attachmentId: file.response.attachmentId,
                filename: file.response.filename
            };

            this.attachUploading = true;
            axios.post('/api/account/messaging/upload/delete', data).then(resp => {
                this.attachUploading = false;
                this.$refs.uploader.remove(file.id);
            }).catch(err => {
                this.attachUploading = false;
                // TODO
            });
        },
        handleSellerDeliveryUploadAdd: function(file, component) {
            this.sellerDeliverUploading = true;
            component.active = true;
        },
        handleSellerDeliveryUploadAfter: function(file, component) {
            this.sellerDeliverUploading = false;

            if (file.error || !file.response || !file.response.attachmentId) {
                component.remove(file.id);

                if (file.response && file.response.error) {
                    // TODO: report error somewhere
                }

                return;
            }
        },
        handleSellerDeliveryUploadDelete: function(file) {
            if (this.sellerDeliverUploading) {
                return;
            }

            let data = {
                attachmentId: file.response.attachmentId,
                filename: file.response.filename
            };

            axios.post('/api/account/messaging/upload/delete', data).then(resp => {
                this.attachUploading = false;
                this.$refs.deliverUploader.remove(file.id);
            });
        },
    }
});

export default accountOrderSellerApp;
