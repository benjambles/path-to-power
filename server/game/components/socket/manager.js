import Promise from 'bluebird';
import io from 'socket.io';
import EventEmitter from 'events';
import {ACCOUNT_AUTHENTICATE} from '../account/types';

/**
 * Socket manager
 */
export default class SocketManager extends EventEmitter {
    /**
     * class constructor
     * @param  {Game}    Game   The game object
     * @param  {Express} server The express/http server object
     */
    constructor(Game, server) {
        super(Game, server);

        this.Game = Game;
        // holds the active socket clients, for logged in users
        this.clients = {};
        // webserver
        this.server = server;
        // setup the socket server
        this.io = io(server);
        // disconnect timers (for DC events)
        this.timers = {};

        this.onDisconnect = this.onDisconnect.bind(this);
        this.clearTimer = this.clearTimer.bind(this);
    }

    /**
     * Get a socket belonging to the user
     * @param  {String} user_id The user id of the user whos socket we are looking for
     * @return {Promise}
     */
    get(user_id) {
        return new Promise((resolve, reject) => {
            const socket = this.clients[user_id];

            if (!socket) {
                return reject(`No socket found for user: ${user_id}`);
            }

            resolve(socket);
        });
    }

    /**
     * Will make the IO server start listening for connections
     */
    listen() {
        this.Game.logger.info(`Socket is listing on port ${this.Game.config.server.port}`);
        // setup event listeners
        this.io.on('connection', this.onConnection.bind(this));

        // listen for connections
        this.server.listen(this.Game.config.server.port);
    }

    /**
     * Handles new connections
     * @param  {Socket.IO Socket} socket
     */
    onConnection(socket) {
        socket.on('dispatch', (action) => {
            this.onClientDispatch(socket, action);
        });
        socket.on('logout', (action) => {
            this.onDisconnect({...socket.user});
            socket.user = null;
        });
        socket.on('disconnect', () => {
            this.onDisconnect(socket.user);
        });
    }

    /**
     * Add a socket to track in the list
     * @param {Socket.Io object} socket The socket object to track
     */
    add(socket) {
        this.clients[socket.user.user_id] = socket;
    }

    /**
     * Removes a tracked socket reference from the list
     * @param  {String} user_id  User Id of the socket to delete
     */
    remove(user_id) {
        delete this.clients[user_id];
    }

    /**
     * Removes a disconnection timer
     * @param  {String} user_id User Id
     * @return {Boolean} true is a timer was killed.
     */
    clearTimer(user_id) {
        if (this.timers[user_id]) {
            clearTimeout(this.timers[user_id]);
            delete this.timers[user_id];
            return true;
        }

        return false;
    }

    /**
     * Handles socket disconnections
     * @param  {Socket.IO Socket} socket
     */
    onDisconnect(user = null, forced = false) {
        // if the user is logged in, set a timer for when we remove them from the game.
        if (user) {
            this.Game.logger.info('Socket disconnected', user);

            if (forced) {
                return this.emit('disconnect', user);
            }

            this.timers[user.user_id] = setTimeout(() =>{
                this.emit('disconnect', user);
            }, this.Game.config.game.logout_timer);
        }
    }

    /**
     * Handles new actions from sockets/the clients
     * @param  {Object} action Redux-action object
     */
    onClientDispatch(socket, action) {
        this.Game.logger.info('New action', {type: action.type});
        // Make sure actions have the right composition
        if (!action.type) {
            return;
        }

        // if the client is not authenticating, but sending dispatches without
        // being authenticated, ignore the request.
        if (!socket.user && action.type !== ACCOUNT_AUTHENTICATE) {
            return;
        }

        // emit the dispatch, which managers listen for
        this.emit('dispatch', socket, action);
    }

    /**
     * Dispatches an action to a specific socket
     * @param  {Socket.IO Socket} socket The socket to dispatch to
     * @param  {Object} action Redux action object
     */
    dispatchToSocket(socket, action) {
        socket.emit('dispatch', action);
    }

    /**
     * Dispatches an action to a specific user
     * @param  {String} user_id  User Id of the account
     * @param  {Object} action   Redux action object
     */
    dispatchToUser(user_id, action) {
        if (!this.clients[user_id]) {
            return;
        }

        this.clients[user_id].emit('dispatch', action);
    }

    /**
     * Dispatches an action to a specific room
     * @param  {String} roomId Room ID/key
     * @param  {Object} action Redux action object
     */
    dispatchToRoom(roomId, action) {
        if (!roomId) {
            return this.Game.logger.error('Missing roomId from dispatchToRoom?:', roomId, ' for action:', action);
        }

        this.io.sockets.in(roomId).emit('dispatch', action);
    }

    /**
     * Dispatches an action to the whole server
     * @param  {Object} action Redux action object
     */
    dispatchToServer(action) {
        this.io.emit('dispatch', action);
    }

    /**
     * Get the socket of the user, and join the specific room
     * @param  {String} user_id User ID
     * @param  {String} roomId  Room ID to join
     */
    userJoinRoom(user_id, roomId) {
        const action = this.get(user_id);

        action
            .then((socket) => {
                socket.join(roomId);
            })
            .catch(() => {});

        return action;
    }

    /**
     * Get the socket of the user, and leaves the specific room
     * @param  {String} user_id User ID
     * @param  {String} roomId  Room ID to leaves
     */
    userLeaveRoom(user_id, roomId) {
        const action = this.get(user_id);

        action
            .then((socket) => {
                socket.leave(roomId);
            })
            .catch(() => {});

        return action;
    }
}
