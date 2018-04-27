import Vue from 'vue';
import fecha from 'fecha';
import axios from 'axios';
import VueFileUpload from 'vue-upload-component';
import spinner from '../shared/components/spinner';

import storeInstance from '../frontend/store';
import messagingInstance from '../shared/messaging';
import { formatTimespanFromNow, parseQueryString, checkPatterns } from '../shared/utils';


const ITEMS_ON_PAGE = 5;

const accountInboxApp = new Vue({
    components: {
        spinner,
        FileUpload: VueFileUpload
    },
    data: {
        sharedState: storeInstance.state,

        // inbox, unread, sent, archive
        folder: 'inbox',

        tabCounts: {
            unread: 0
        },

        currentRoom: null,
        currentRoomPeer: null,
        currentRoomOrder: null,
        currentRoomService: null,
        currentRoomMessages: [],
        currentRoomMessagesLoading: false,
        currentRoomNewMessage: '',
        currentRoomNewMessageLoading: false,
        currentRoomEnquiryRecorded: false,

        messageIncludedBlockWord: {
            pay: false,
            skype: false,
            phone: false,
            email: false
        },

        itemsLoading: false,
        items: [],
        itemsUnread: [],

        totalResults: 0,
        currentPage: 1,
        gotoPage: 1,
        pages: [1],

        selectedItems: {},

        attachError: null,
        attachUploading: false,
        attachUploads: [],
        attachUploadEvents: {},
        processingTab: true,
        minPreloaderDuration: 400
    },
    watch: {
        currentRoomNewMessage: function(str) {
            this.messageIncludedBlockWord = checkPatterns(str);
        }
    },
    mounted: function() {
        let messagingReadyInterval = setInterval(() => {
            if (messagingInstance.isAuthenticated) {
                clearInterval(messagingReadyInterval);

                this.fetchMeta();

                let qs = parseQueryString();

                if (qs.type === 'enquiry') {
                    if (!isNaN(qs.id)) {
                        // Also set room ID
                        this.loadCurrentRoom(+qs.id);
                    }
                }

                this.fetchItems();

                this.$watch('currentRoom', newCurrentRoom => {
                    if (!newCurrentRoom) {
                        this.currentRoomPeer = null;
                        this.currentRoomOrder = this.currentRoomService = null;
                        this.currentRoomMessages = [];
                        this.currentRoomNewMessage = '';
                        this.currentRoomEnquiryRecorded = false;
                        this.selectedItems = {};
                        return;
                    }

                    this.initCurrentRoom(newCurrentRoom);
                });
            }
        }, 100);
    },
    methods: {
        setFolder(folder) {
            if (this.folder === folder) return;
            this.processingTab = true;
            this.folder = folder;

            this.currentRoom = null;
            this.currentPage = this.gotoPage = 1;
            this.totalResults = 0;
            this.items = [];
            this.selectedItems = {};
            this.fetchItems();
        },
        fetchMeta: function() {
            messagingInstance.loadCounts(['enquiry'], (err, body) => {
                this.tabCounts.unread = body.data[0].unread;
            });
        },

        fetchItems: function(page = 1) {
            let params = {
                limit: ITEMS_ON_PAGE,
                offset: (page - 1) * ITEMS_ON_PAGE,
                folder: this.folder
            };

            this.itemsLoading = true;
            const processStartAt = new Date();
            messagingInstance.loadRooms('enquiry', params).then(body => {
                this.itemsLoading = false;
                const processDuration = new Date() - processStartAt;
                const timeout = processDuration < this.minPreloaderDuration ? this.minPreloaderDuration - processDuration : 0;
                setTimeout(() => {
                    this.processingTab = false;
                }, timeout);

                this.items = body.data.map(this.prepareRoom);

                this.totalResults = body.meta.total;
                this.tabCounts.unread = body.meta.unread;

                this.doBuildPagination();
            }, err => {
                // TODO
                return;
            });
        },

        initCurrentRoom: function(newCurrentRoom) {
            this.currentRoomService = newCurrentRoom.meta.service;

            if (newCurrentRoom.meta.buyer.id === this.sharedState.user.id) {
                this.currentRoomPeer = newCurrentRoom.meta.seller;
            } else {
                this.currentRoomPeer = newCurrentRoom.meta.buyer;
            }

            this.initAttachments();

            this.fetchCurrentRoomPeerInfo();
            this.fetchCurrentRoomMessages();

            if (newCurrentRoom.unread) {
                this.tabCounts.unread = Math.max(0, this.tabCounts.unread - 1);
                newCurrentRoom.unread = false;
            }
        },

        loadCurrentRoom: function(id) {
            messagingInstance.loadRoom('enquiry:' + id, {}, (err, data) => {
                if (err) {
                    // TODO
                    return;
                }

                this.currentRoom = data;
            });
        },

        prepareRoom: function(room) {
            if (room.type === 'order') {
                room._display_name = `Order #${room.meta.order.id} — ${room.meta.service.title}`;
                room._last_action_date_display = formatTimespanFromNow(room.last_action_date);
            } else if (room.type === 'enquiry') {
                room._display_name = `Enquiry on service — ${room.meta.service.title}`;
                room._last_action_date_display = formatTimespanFromNow(room.last_action_date);
            }

            room._username = (room.meta.buyer.id === this.sharedState.user.id) ? room.meta.seller.username : room.meta.buyer.username;
            room._photo_url = '/account/user/photo/' + room._username;

            return room;
        },

        doBuildPagination: function() {
            let totalPages = Math.ceil(this.totalResults / ITEMS_ON_PAGE),
                startingPage = this.currentPage < 3 ? 1 : this.currentPage - 2,
                newPages = [];

            for (let i = 0; i < 5; i++) {
                if (startingPage + i > totalPages) {
                    break;
                }

                newPages.push(startingPage + i);
            }

            this.pages = newPages;
        },
        handlePageSelect: function(page) {
            if (this.pages[this.pages.length - 1] < page || page < 1) {
                this.gotoPage = this.currentPage;
                return;
            }

            this.currentPage = page;
            this.gotoPage = page;

            this.selectedItems = {};
            this.fetchItems(page);
        },

        fetchCurrentRoomPeerInfo: function() {
            if (!this.currentRoomPeer) {
                return;
            }

            let roomStringID = this.currentRoom.type + ':' + this.currentRoom.entity_id;

            axios.get('/api/user/' + this.currentRoomPeer.id, { params: { room: roomStringID } }).then(resp => {
                this.currentRoomPeer = resp.data;
                this.currentRoomPeer._last_seen = formatTimespanFromNow(resp.data.last_logged_on);
            }).catch(err => {
                // TODO:
            });
        },

        fetchCurrentRoomMessages: function() {
            if (!this.currentRoom) {
                return;
            }

            let roomStringID = this.currentRoom.type + ':' + this.currentRoom.entity_id;

            this.currentRoomMessagesLoading = true;
            messagingInstance.loadHistory(roomStringID, { markAsRead: true }, (err, data) => {
                this.currentRoomMessagesLoading = false;

                if (err) {
                    // TODO
                    return;
                }

                this.currentRoomMessages = data.map(this.prepareMessage, this).reverse();
                this.scrollToBottom();

                messagingInstance.subscribeToRoom(roomStringID, this.handleIncomingMessage.bind(this), true);
            });
        },

        prepareMessage: function(message) {
            message._date_display = formatTimespanFromNow(message.date);

            if (this.sharedState.user.id === message.user) {
                message._outgoing = true;
            } else {
                message._incoming = true;
            }

            return message;
        },

        handleIncomingMessage: function(body) {
            this.currentRoomMessages.push(this.prepareMessage(body));
            this.scrollToBottom();
        },

        scrollToBottom: function() {
            setTimeout(() => {
                this.$refs.currentRoomMessagesBody.scrollTop = this.$refs.currentRoomMessagesBody.scrollHeight;
            }, 10);
        },

        handleMessageSend: function() {
            if (this.currentRoomMessagesLoading || this.currentRoomNewMessageLoading || this.attachUploading) {
                return;
            }

            if (!this.currentRoomNewMessage.length && !this.attachUploads.length) {
                return;
            }

            let roomStringID = this.currentRoom.type + ':' + this.currentRoom.entity_id,
                meta;

            if (this.attachUploads.length) {
                meta = {
                    attachments: this.attachUploads.map(file => Object.assign({ size: file.size }, file.response ))
                };
            }

            try {
                messagingInstance.sendMessage(roomStringID, this.currentRoomNewMessage, meta);
                this.currentRoomNewMessage = '';
                this.attachError = null;
                this.attachUploads = [];

                if (this.currentRoom.type === 'enquiry' && !this.currentRoomEnquiryRecorded) {
                    this.recordEnquiryTime(this.currentRoom.entity_id); // TODO: optimize this
                    this.currentRoomEnquiryRecorded = true;
                }
            } catch (e) {
                // TODO
            }
        },

        handleArchiveRoom: function() {
            let roomStringID = this.currentRoom.type + ':' + this.currentRoom.entity_id;

            try {
                messagingInstance.archiveRooms([roomStringID], err => {
                    if (err) {
                        // TODO
                        return;
                    }

                    this.currentRoom = null;
                    this.fetchItems();
                });
            } catch (e) {
                // TODO
            }
        },

        handleArchiveRooms: function() {
            let roomStringIDs = [];
            for (let roomStringID in this.selectedItems) {
                if (this.selectedItems[roomStringID]) {
                    roomStringIDs.push(roomStringID);
                }
            }

            if (!roomStringIDs.length) {
                return;
            }

            try {
                messagingInstance.archiveRooms(roomStringIDs, err => {
                    if (err) {
                        // TODO
                        return;
                    }

                    this.items = [];
                    this.selectedItems = {};
                    this.fetchItems(this.currentPage);
                });

                this.items = [];
                this.selectedItems = {};
                this.fetchItems(this.currentPage);
            } catch (e) {
                // TODO
            }
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

        recordEnquiryTime: function(enquiryId) {
            axios.post('/api/account/messaging/enquiry/record_time', { id: enquiryId }).then(resp => {}).catch(err => {});
        }
    }
});

export default accountInboxApp;
