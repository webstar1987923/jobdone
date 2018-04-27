import Vue from 'vue';
import axios from 'axios';
import md5 from 'md5';
import VueFileUpload from 'vue-upload-component';
import vSelect from 'vue-select';
import { modal } from 'vue-strap';
import 'css-toggle-switch/dist/toggle-switch.css';
import * as Clipboard from 'clipboard';

import { runSmoothScrolling, parseQueryString, checkPatterns } from '../shared/utils';
import storeInstance from '../frontend/store';


const TOOLTIPS = {
    'title': { title: 'Title', desc: 'Please enter something meaningful' },
    'category_id': { title: 'Category', desc: 'Please enter something meaningful' },
    'description': { title: 'Description', desc: 'Please enter something meaningful' },
    'tags': { title: 'Tags', desc: 'Please enter something meaningful' },
    'price': { title: 'Price', desc: 'Please enter something meaningful' },
    'delivery_time': { title: 'Delivery Time', desc: 'Please enter something meaningful' },
};


let galleryTooltipTimeouts = {};

const accountServiceApp = new Vue({
    components: {
        FileUpload: VueFileUpload,
        vSelect,
        modal
    },
    data: {
        sharedState: storeInstance.state,

        tab: 0,
        editMode: false,

        allowedTab: 0,
        isLoading: false,

        topCategory: null,
        topCategoryMapping: {},

        id: null,
        isPublished: false,

        fields: {
            title: '',
            is_private: false,
            category_id: '-1',
            description: '',

            price: '',
            delivery_time: ''
        },

        descriptionWords: 0,
        descriptionBlockWordError: {
            skype: false,
            email: false,
            domain: false,
            phone: false
        },
        descriptionWarning: false,
        minPrice: '0.00',

        errors: {
            general: null,
            fields: {},
            publish: null,
            photos: null,
            videos: null
        },
        success: false,

        tooltip: null,
        tooltipTop: 0,

        tags: [],
        selectTags: [],

        faqs: [],
        newFaqItem: { q: '', a: '' },
        newFaqItemError: false,
        showFaqEditor: false,

        extras: [],
        newExtra: generateNewExtra('custom'),
        newExtraError: false,
        showExtraEditor: false,

        requirements: [],
        newRequirement: { text: '', type: 'text', required: false, id: null },
        newRequirementError: false,

        galleryLoading: false,

        photos: [],
        photosLoading: false,
        photoTooltipTop: 0,

        photoUploads: [],
        photoUploadEvents: {},
        photoUploadAction: '',
        photoUploadData: null,

        previewImages: {},        

        videos: [],
        videosLoading: false,
        videoTooltipTop: 0,
        previewVideoCounts: 0,

        videoUploads: [],
        videoUploadEvents: {},
        videoUploadAction: '',

        videoPreviewShow: false,
        videoPreviewCode: null,

        deleteFileModalShow: false,
        deleteFileModalMode: null,
        deleteFileModalId: null,

        // Various URLs
        urls: {},
        faqExpanded: null,
        extraExpanded: null,
        requirementExpanded: null
    },
    mounted: function() {
        let mapping = {};

        this.sharedState.extra.categories.forEach(category => {
            mapping[category.id] = category.subcategories;
        });

        this.topCategoryMapping = mapping;

        if (this.sharedState.extra.service) {
            // Turn on edit mode instead of create
            this.initWithService(this.sharedState.extra.service);
        }

        this.photoUploadEvents = {
            add: this.handlePhotoUploadAdd.bind(this),
            after: this.handlePhotoUploadAfter.bind(this)
        };

        this.videoUploadEvents = {
            add: this.handleVideoUploadAdd.bind(this),
            after: this.handleVideoUploadAfter.bind(this)
        };

        this.minPrice = (this.sharedState.extra.min_price / 100).toFixed(2);

        let qs = parseQueryString();

        if (!isNaN(qs.tab) && qs.tab <= this.allowedTab) {
            this.handleTabChange(+qs.tab);
        }

        if (this.tab === 0) {
            this.initMarkdownEditor();
        }
    },    
    methods: {
        toggleExpanded(target, i) {
            this[target] = this[target] === i ? null : i;
        },
        initWithService: function(service) {
            console.debug('Edit mode on:', service);

            this.id = service.id;
            this.isPublished = !!service.published_on;

            if (service.published_on) {
                console.debug('Service is published - turn on edit more');
                this.editMode = true;
            }

            this.photoUploadAction = '/api/account/seller/services/' + this.id + '/photos';
            this.videoUploadAction = '/api/account/seller/services/' + this.id + '/videos';

            let fields = {
                title: service.title,
                category_id: service.category_id,
                description: service.description,
                price: service.price ? (service.price / 100).toFixed(2) : null,
                delivery_time: service.delivery_time,
                is_private: service.is_private
            };

            for (let categoryId in this.topCategoryMapping) {
                for (let idx in this.topCategoryMapping[categoryId]) {
                    if (this.topCategoryMapping[categoryId][idx].id === service.category_id) {
                        this.topCategory = categoryId;
                        break;
                    }
                }
                if (this.topCategory) {
                    break;
                }
            }

            this.fields = fields;
            this.faqs = service.faqs || [];
            this.tags = service.tags || [];
            this.requirements = (service.requirements || []).map(req => {
                if (!req.id) {
                    return Object.assign({ id: null }, req);
                }
                return req;
            });
            this.extras = service.extras || [];

            if (this.editMode) {
                // Allow view "Publish" tab for published service
                this.allowedTab = 4;
            } else {
                this.allowedTab = 1;
            }
        },
        fetchSelectTags: function(search, loading) {
            loading(true);
            axios.get('/api/account/seller/search/tags?query=' + encodeURIComponent(search)).then(resp => {
                this.selectTags = resp.data;
                loading(false);
            }).catch(err => {
                // TODO
                loading(false);
            });
        },
        handleTopCategoryChange: function() {
            this.fields.category_id = '-1';
        },
        handleTagsChange: function() {
            if (this.tags.length > 5) {
                this.tags = this.tags.slice(0, 5);
            }
        },
        handleTabChange: function(tab) {
            if (tab > this.allowedTab || (this.tab === 5 && !this.editMode)) {
                return;
            }

            if (tab === 3) {
                // Gallery
                this.loadPhotos();
                this.loadVideos();
            }

            if (tab === 4 && this.isPublished) {
                tab = 5;
            }

            if (tab === 5) {
                // Load share URLs
                this.loadURLs();
                window.c = new Clipboard.default('#copy-button-1');
            }

            this.success = false;
            this.tab = tab;

            if (tab === 0) {
                setTimeout(() => this.initMarkdownEditor(), 10);
            }
        },
        handleSaveClick: function() {
            if (this.isLoading) {
                return;
            }

            if (!this.id) {
                this.sendCreateRequest();
                return;
            }

            this.sendUpdateRequest();
        },
        handlePublishClick: function() {
            this.isLoading = true;
            this.errors.publish = false;
            axios.post('/api/account/seller/services/' + this.id + '/publish').then(res => {
                this.isLoading = false;

                // Switch to the next tab automatically
                this.tab = 5;
            }).catch(err => {
                this.errors.publish = true;
                this.isLoading = false;
            });
        },
        handleQuestionAdd: function() {
            if (!this.newFaqItem.q || !this.newFaqItem.a) {
                this.newFaqItemError = true;
                return;
            }

            this.newFaqItemError = false;
            this.faqs.unshift(this.newFaqItem);
            this.newFaqItem = { q: '', a: '' };
            this.showFaqEditor = false;
        },
        handleQuestionDiscard: function() {
            this.newFaqItemError = false;
            this.newFaqItem = { q: '', a: '' };
            this.showFaqEditor = false;
        },
        handleQuestionRemove: function(idx) {
            this.faqs.splice(idx, 1);
        },
        sendCreateRequest: function() {
            //check block words
            let bExistBlockWord = this.descriptionBlockWordError.skype || this.descriptionBlockWordError.phone || this.descriptionBlockWordError.email || this.descriptionBlockWordError.domain;
            
            if (bExistBlockWord ||  this.descriptionWords < 150 || this.descriptionWords > 5000) {
                
                this.showError("Please make sure you have specified all the fields properly.", 
                    { description: 'required', description_skype: this.descriptionBlockWordError.skype, 
                    description_email: this.descriptionBlockWordError.email,
                    description_phone: this.descriptionBlockWordError.phone,
                    description_domain: this.descriptionBlockWordError.domain });  
                return;
            }

            let data = {
                title: this.fields.title,
                category_id: this.fields.category_id,
                description: this.fields.description,
                is_private: this.fields.is_private,

                faqs: this.faqs,
                tags: this.tags
            };

            this.isLoading = true;
            this.errors.general = null;
            this.errors.fields = {};
            axios.post('/api/account/seller/services', data).then(res => {
                this.isLoading = false;
                
                this.id = res.data.id;
                this.photoUploadAction = '/api/account/seller/services/' + this.id + '/photos';
                this.videoUploadAction = '/api/account/seller/services/' + this.id + '/videos';

                location.href = res.data._edit_url;

                // Switch to the next tab automatically
                // this.allowedTab = 1;
                // this.tab = 1;
            }).catch(err => {
                this.isLoading = false;                
                this.handleSaveError(err);
            });
        },
        sendUpdateRequest: function() {
            let data = {};

            if (this.tab === 0) {
                let bExistBlockWord = this.descriptionBlockWordError.skype || this.descriptionBlockWordError.phone || this.descriptionBlockWordError.email || this.descriptionBlockWordError.domain;
                
                if (bExistBlockWord || this.descriptionWords < 150 || this.descriptionWords > 5000) {
                    this.showError("Please make sure you have specified all the fields properly.", 
                        { description: 'required', description_skype: this.descriptionBlockWordError.skype, 
                        description_email: this.descriptionBlockWordError.email,
                        description_phone: this.descriptionBlockWordError.phone,
                        description_domain: this.descriptionBlockWordError.domain });                
                    return;
                }

                data.title = this.fields.title;
                data.category_id = this.fields.category_id;
                data.description = this.fields.description;

                data.faqs = this.faqs;
                data.tags = this.tags;
            }

            if (this.tab === 1) {
                data.price = Math.round(+this.fields.price * 100);
                data.delivery_time = +this.fields.delivery_time;
                data.extras = this.extras;

                if (isNaN(data.price)) {
                    this.showError('The price you have specified is incorrect', { price: 1 });
                    return;
                }

                if (isNaN(data.delivery_time)) {
                    this.showError('Please specify correct delivery time in days', { delivery_time: 1 });
                    return;
                }
            }

            if (this.tab === 2) {
                data.requirements = this.requirements;
            }

            if (this.tab === 3) {
                if (!this.photos.length && !this.videos.length) {
                    this.showError('At least one photo or video is required to proceed');
                    return;
                }
            }

            this.isLoading = true;
            this.errors.general = null;
            this.errors.fields = {};  

            axios.put('/api/account/seller/services/' + this.id, data).then(res => {
                this.isLoading = false;

                // Switch to the next tab automatically
                if (!this.editMode) {
                    if (this.tab !== 4) {
                        this.allowedTab++;
                        this.tab++;
                    }
                } else {
                    this.success = res.data._url;
                }
            }).catch(err => {
                this.isLoading = false;                
                this.handleSaveError(err);
            });
        },
        handleSaveError: function(err) {            
            if (err.response.data.error) {
                this.showError(err.response.data.error.message, err.response.data.error.fields);
            } else {
                this.showError('Unknown error has occured while processing your request. Please try again later');
            }
        },
        showError: function(general, fields) {            
            this.errors.general = general;
            this.errors.fields = fields || {};
            runSmoothScrolling(this.$refs.navbar.offsetTop, 200);
        },
        handleRequirementAdd: function() {
            if (!this.newRequirement.text) {
                this.newRequirementError = true;
                return;
            }

            this.newRequirementError = false;
            this.requirements.push(this.newRequirement);
            this.newRequirement = { text: '', type: 'text', required: false, id: null };
        },
        handleRequirementRemove: function(idx) {
            this.requirements.splice(idx, 1);
        },
        handleExtraAdd: function() {
            if (!this.newExtra.text || isNaN(this.newExtra.price) || +this.newExtra.price < 0) {
                this.newExtraError = true;
                return;
            }

            this.newExtraError = false;

            let newExtra = Object.assign({}, this.newExtra, { price: Math.round(+this.newExtra.price * 100) });
            this.extras.push(newExtra);

            this.newExtra = generateNewExtra('custom');
            this.showExtraEditor = false;
        },
        handleExtraDiscard: function(idx) {
            this.newExtraError = false;
            this.newExtra = generateNewExtra('custom');
            this.showExtraEditor = false;
        },
        handleExtraRemove: function(idx) {
            this.extras.splice(idx, 1);
        },
        loadPhotos: function() {
            if (this.photos.length) {
                // Photos has been already loaded
                return;
            }

            this.galleryLoading = true;
            axios.get('/api/account/seller/services/' + this.id + '/photos').then(res => {
                this.galleryLoading = false;
                this.photos = res.data;
            }).catch(res => {
                this.galleryLoading = false;
                // TODO
            });
        },
        loadVideos: function() {
            if (this.videos.length) {
                // Videos has been already loaded
                return;
            }

            this.galleryLoading = true;
            axios.get('/api/account/seller/services/' + this.id + '/videos').then(res => {
                this.galleryLoading = false;
                this.videos = res.data;
            }).catch(res => {
                this.galleryLoading = false;
                // TODO
            });
        },
        loadURLs: function() {
            axios.get('/api/account/seller/services/' + this.id + '/urls').then(res => {
                this.urls = res.data;
            });
        },
        handlePhotoUploadAdd: function(file, component) {
            const SUPPORTED_MIMETYPES = [
                                            "image/jpeg",
                                            "image/jpg",
                                            "image/png"
                                        ];
            const MAXIUM_SIZE = 5 * 1024 * 1024; //5MB

            if (SUPPORTED_MIMETYPES.indexOf(file.file.type) == -1) {
                component.remove(file);
                this.errors.photos = file.file.name + ': This file type is not supported. Please try one of the following: JPEG, JPG, PNG';
                return;
            }
            if (file.file.size > MAXIUM_SIZE) {
                component.remove(file);
                this.errors.photos = file.file.name + ': is too big. The size can not be larger than 5MB';
                return;
            }

            readFile(file.file, rawData => {
                let hash = md5(rawData);

                if (this.photos.some(photo => (photo.md5 && photo.md5 === hash))) {
                    // Files uploaded earlier may not have md5, so we ignore them
                    this.errors.photos = 'You\'ve already uploaded this file';
                    component.remove(file);
                    return;
                }

                // Send checksum to the backend
                file.data = { md5: hash };

                this.photosLoading = true;
                component.active = true;
                this.errors.photos = null;

                this.previewImages[hash] = URL.createObjectURL(file.file);               
            });
        },
        handlePhotoUploadAfter: function(file, component) {            
                        
            if (file.error || !file.response) {
                if (typeof file.response === 'object' && file.response.error && file.response.error.message) {
                    this.errors.photos = file.response.error.message;
                } else {
                    this.errors.photos = 'Error occured while uploading image. Please try again a little later';
                }

                readFile(file.file, rawData => {
                    let hash = md5(rawData);                   
                    
                    delete this.previewImages[hash];          
                    if (Object.keys(this.previewImages).length == 0) {
                        this.photosLoading = false;    
                    }
                });

                component.remove(file.id);
                return;
            }

            // Update photos with the new list which comes from response
            this.photos = file.response;
        },
        loadPhoto: function(hash) {
            if (Object.keys(this.previewImages).length == 0) {
                return;
            }
            
            delete this.previewImages[hash];            
            
            if (Object.keys(this.previewImages).length == 0) {
                this.photosLoading = false;    
            }
        },
        handleGalleryItemRemoveClick: function(mode, id) {
            this.deleteFileModalMode = mode;
            this.deleteFileModalId = id;
            this.deleteFileModalShow = true;
        },
        handleGalleryItemRemove: function() {
            if (!this.deleteFileModalId) {
                return;
            }

            this.deleteFileModalShow = false;

            if (this.deleteFileModalMode === 'photos') {
                this.galleryLoading = true;
                axios.delete('/api/account/seller/services/' + this.id + '/photos/' + this.deleteFileModalId).then(res => {
                    this.galleryLoading = false;
                    this.photos = res.data;
                }).catch(res => {
                    this.galleryLoading = false;
                    // TODO
                });
            } else {
                this.galleryLoading = true;
                axios.delete('/api/account/seller/services/' + this.id + '/videos/' + this.deleteFileModalId).then(res => {
                    this.galleryLoading = false;
                    this.videos = res.data;
                }).catch(res => {
                    this.galleryLoading = false;
                    // TODO
                });
            }
        },
        handleVideoUploadAdd: function(file, component) {
            //TODO: place to file with constants or so on
            //TODO: Add all supported mimetypes
            const SUPPORTED_MIMETYPES = [
                "video/mp4",
                "video/ogg",
                "video/webm"                
            ];
            const MAX_VIDEO_SIZE = 50 * 1024 * 1024; //50 MB

            if (SUPPORTED_MIMETYPES.indexOf(file.file.type) == -1) {
                component.remove(file);
                this.errors.videos = file.file.name + ': This file type is not supported. Please try one of the following: MP4, AVI';
                return;
            } 
            if (file.file.size > MAX_VIDEO_SIZE) {
                component.remove(file);
                this.errors.videos = file.file.name + ': is too big. The size can not be larger than 50 MB';
                return;
            }

            readFile(file.file, rawData => {
                let hash = md5(rawData);

                if (this.videos.some(video => (video.md5 && video.md5 === hash))) {
                    // Files uploaded earlier may not have md5, so we ignore them
                    this.errors.videos = 'You\'ve already uploaded this file';
                    component.remove(file);
                    return;
                }

                // Send checksum to the backend
                file.data = { md5: hash };

                this.previewVideoCounts ++;
                this.videosLoading = true;
                this.errors.videos = null;
                component.active = true;
            });            
        },
        handleVideoUploadAfter: function(file, component) {
            this.previewVideoCounts --;
            if (this.previewVideoCounts == 0) {
                this.videosLoading = false;
            }

            if (file.error || !file.response) {
                if (typeof file.response === 'object' && file.response.error && file.response.error.message) {
                    this.errors.videos = file.response.error.message;
                } else {
                    this.errors.videos = 'Error occured while uploading video. Please try again a little later';
                }

                component.remove(file.id);
                return;
            }

            // Update videos with the new list which comes from response
            this.videos = file.response;
        },
        handleGalleryItemClick: function(id) {
            if (!id) {
                return;
            }

            this.galleryLoading = true;
            axios.post('/api/account/seller/services/' + this.id + '/gallery/' + id + '/primary').then(res => {
                this.galleryLoading = false;
                this.photos = this.photos.map(photo => {
                    photo.primary = (photo.id === id);
                    return photo;
                });

                this.videos = this.videos.map(video => {
                    video.primary = (video.id === id);
                    return video;
                });
            }).catch(res => {
                this.galleryLoading = false;
                // TODO
            });
        },
        openTooltip: function(field, event) {
            this.tooltip = TOOLTIPS[field];
            this.success = false;

            let elementTop = event.target.getBoundingClientRect().top,
                bodyTop = document.body.getBoundingClientRect().top;

            this.tooltipTop = elementTop - bodyTop - this.$refs.navbar.offsetTop - 75;
        },
        openGalleryTooltip: function(mode) {
            let bodyTop = document.body.getBoundingClientRect().top;

            clearTimeout(galleryTooltipTimeouts[mode]);

            if (mode === 'photos') {
                let photosTop = this.$refs.photos.getBoundingClientRect().top;
                this.photoTooltipTop = photosTop - bodyTop - this.$refs.navbar.offsetTop - 35;
                this.videoTooltipTop = 0;
            } else {
                let videosTop = this.$refs.videos.getBoundingClientRect().top;
                this.videoTooltipTop = videosTop - bodyTop - this.$refs.navbar.offsetTop - 35;
                this.photoTooltipTop = 0;
            }
        },
        closeGalleryTooltip: function(mode) {
            galleryTooltipTimeouts[mode] = setTimeout(() => {
                if (mode === 'photos') {
                    this.photoTooltipTop = 0;
                } else {
                    this.videoTooltipTop = 0;
                }
            }, 1000);
        },
        initMarkdownEditor: function() {
            let editor = new window.SimpleMDE({
                element: this.$refs.textarea,
                spellChecker: false,
                initialValue: this.fields.description,
                status: false,
                forceSync: true,
                autosave: true,
                toolbar: [
                    'bold',
                    'italic',
                    '|',
                    'heading-1',
                    'heading-2',
                    'heading-3',
                    '|',
                    'unordered-list',
                    'ordered-list',
                    'horizontal-rule',
                    '|',
                    'preview'
                ]
            });

            this.descriptionWords = countWords(this.fields.description);
            this.descriptionWarning = false;

            editor.codemirror.on('change', () => {
                let value = editor.value();
                this.fields.description = value;
                this.descriptionWords = countWords(value);
                this.descriptionWarning = checkIncludeHtmlTag(value);
                this.descriptionBlockWordError = checkPatterns(value);
            });
        },
        openSocialWindow: function(url) {
            window.open(url, 'popup', 'width=600,height=600');            
        }
    }
});

function readFile(file, cb) {
    var reader = new FileReader();
    reader.onloadend = function(evt) {
        // file is loaded
        cb(evt.target.result);
    };
    reader.readAsText(file);
}

function checkIncludeHtmlTag(str) {
    
    let chkEl = document.createElement('div');     
 
    if (!str.length) {return false;}
    chkEl.innerHTML = str;
    
    return chkEl.getElementsByTagName('*').length;
}

function countWords(str) {
    let s = str.replace(/(^\s*)|(\s*$)/gi,"");
        s = s.replace(/[ ]{2,}/gi," ");
        s = s.replace(/\n /,"\n");

        return s.split(' ').length;        
}

function generateNewExtra(type) {
    return {
        id: null, // To be assigned on the server side
        text: '',
        description: '',
        type: type,
        price: '0.00'
    };
}


export default accountServiceApp;
