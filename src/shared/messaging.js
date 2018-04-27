import axios from 'axios';
import SockJS from 'sockjs-client';


class Messaging {
    constructor() {
        this.isConnected = false;
        this.isAuthenticated = false;
        this.user = null;

        this.responseListeners = {};
    }

    init(server, user) {
        this.user = user;
        this.socket = new SockJS(server);

        this.socket.onopen = () => {
            this.isConnected = true;
            this.isAuthenticated = false;
        };

        this.socket.onclose = () => {
            this.isConnected = false;
            this.isAuthenticated = false;
        };

        this.socket.onmessage = (evt) => {
            let msg = JSON.parse(evt.data), 
                type = msg.t,
                body = msg.b,
                uid = msg.u;

            console.debug('Got message:', type, body);

            if (type === 'auth.token') {
                this.authenticateMessaging(body);
            } else if (type === 'auth.success') {
                this.isAuthenticated = true;
                console.debug('Messaging is authenticated');
            }

            if (!this.isAuthenticated) {
                return;
            }

            if (type in this.responseListeners) {
                this.responseListeners[type].forEach(item => {
                    if (item.uid && uid) {
                        if (item.uid === uid) {
                            item.fn(body);
                        }
                    } else {
                        item.fn(body);
                    }
                });
            }
        };
    }

    authenticateMessaging(data) {
        axios.post('/api/account/messaging/auth', data).then(res => {
            
        }).catch(res => {
            // TODO
        });
    }

    addResponseListener(type, cb, override, uid) {
        if (!this.responseListeners[type] || override) {
            this.responseListeners[type] = [];
        }

        this.responseListeners[type].push({
            fn: cb,
            uid: uid
        });
    }

    removeResponseListener(type, cb, uid) {
        if (!this.responseListeners[type]) {
            return;
        }

        let idx = -1,
            currentIdx = 0;

        for (let item of this.responseListeners[type]) {
            if (uid && item.uid === uid) {
                idx = currentIdx;
                break;
            }

            if (item.cb === cb) {
                idx = currentIdx;
                break;
            }

            currentIdx++;
        }

        if (idx === -1) {
            return;
        }

        this.responseListeners.splice(idx, 1);
    }

    loadHistory(roomStringID, params, cb) {
        if (!this.isConnected || !this.isAuthenticated) {
            return cb(new Error('Not connected or authenticated'));
        }

        let uid = Date.now(),
            type = 'history.' + roomStringID,
            fnListener = body => {
                cb(null, body.data || [], body.meta || {});
                this.removeResponseListener(fnListener, uid);
            };

        this.addResponseListener(type, fnListener, false, uid);

        this.socket.send(JSON.stringify({
            t: type,
            b: params,
            u: uid
        }));
    }

    /*loadRooms(type, params, cb) {
        if (!this.isConnected || !this.isAuthenticated) {
            return cb(new Error('Not connected or authenticated'));
        }

        let uid = Date.now(),
            fnListener = body => {
                cb(null, body);
                this.removeResponseListener(fnListener, uid);
            };

        this.addResponseListener('rooms.' + type, fnListener, false, uid);

        this.socket.send(JSON.stringify({
            t: 'rooms.' + type,
            b: params,
            u: uid
        }));
    }*/

    loadRooms(type, params) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected || !this.isAuthenticated) {
                reject(new Error('Not connected or authenticated'));
            }

            let uid = Date.now(),
              fnListener = body => {
                  resolve(body);
                  this.removeResponseListener(fnListener, uid);
              };

            this.addResponseListener('rooms.' + type, fnListener, false, uid);

            this.socket.send(JSON.stringify({
                t: 'rooms.' + type,
                b: params,
                u: uid
            }));
        });
    }

    loadRoom(roomStringID, params, cb) {
        if (!this.isConnected || !this.isAuthenticated) {
            return cb(new Error('Not connected or authenticated'));
        }

        let uid = Date.now(),
            type = 'room.' + roomStringID,
            fnListener = body => {
                cb(null, body || null);
                this.removeResponseListener(fnListener);
            };

        this.addResponseListener(type, fnListener, false, uid);

        this.socket.send(JSON.stringify({
            t: type,
            b: params
        }));
    }

    loadCounts(rooms, cb) {
        if (!this.isConnected || !this.isAuthenticated) {
            return cb(new Error('Not connected or authenticated'));
        }

        let fnListener = body => {
            cb(null, body);
            this.removeResponseListener(fnListener);
        };

        this.addResponseListener('count', fnListener);

        this.socket.send(JSON.stringify({
            t: 'count',
            b: {
                rooms: rooms
            }
        }));
    }

    subscribeToRoom(roomStringID, cb, override) {
        this.addResponseListener('message.' + roomStringID, cb, override);
    }

    subscribeToRoomUpdates(roomStringID, cb, override) {
        this.addResponseListener('message.update.' + roomStringID, cb, override);
    }

    subscribeToNotifications(cb, override) {
        let uid = Date.now();
        this.addResponseListener('notification', cb, override, uid);
    }

    subscribeToRead(cb, override) {
        this.addResponseListener('read', cb, override);
    }

    sendMessage(roomStringID, text, meta, cb) {
        if (!this.isConnected || !this.isAuthenticated) {
            return cb && cb(new Error('Not connected or authenticated'));
        }

        let type = 'message.' + roomStringID,
            body = {
                text: text
            };

        if (meta) {
            body.meta = meta;
        }

        this.socket.send(JSON.stringify({
            t: type,
            b: body
        }));
    }

    archiveRooms(roomStringIDs, cb) {
        if (!this.isConnected || !this.isAuthenticated) {
            return cb && cb(new Error('Not connected or authenticated'));
        }

        let type = 'archive',
            body = {
                rooms: roomStringIDs
            },
            uid = Date.now(),
            fnListener = body => {
                cb(null, body);
                this.removeResponseListener(fnListener, uid);
            };

        this.addResponseListener(type, fnListener, false, uid);

        this.socket.send(JSON.stringify({
            t: type,
            b: body
        }));
    }
}


const messagingInstance = new Messaging();
export default messagingInstance;
    