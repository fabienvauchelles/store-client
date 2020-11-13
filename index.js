'use strict';

const
    _ = require('lodash'),
    Promise = require('bluebird'),
    crypto = require('crypto'),
    request = require('request'),
    winston = require('winston');



class StoreClient {
    constructor(config) {
        this._config = config;
    }


    async request(opts) {
        winston.debug('[StoreServer] request(): opts.url=', opts.url);

        const id = this._getID(opts);

        let data = await this._getData(id);
        if (data) {
            data.requestId = id;
            data.cached = true;

            winston.debug('use cached data');
            return data;
        }

        const res = await this._makeRequestFailRetry(opts, this._config.retry);
        data = res.toJSON();
        data.requestId = id;
        data.cached = false;

        winston.debug('use online data');
        return data;
    }


    async store(data) {
        winston.debug('[StoreServer] store(): data.requestId=', data.requestId);

        if (data.cached) {
            return;
        }

        const newData = _.omit(data, 'requestId', 'cached');

        const opts = {
            method: 'POST',
            baseUrl: this._config.url,
            url: data.requestId,
            json: newData,
        };

        await this._makeRequest(opts);
    }


    async _getData(id) {
        winston.debug('[StoreServer] request: _getData(): id=', id);

        const opts = {
            baseUrl: this._config.url,
            url: id,
            json: true,
        };

        const res = await this._makeRequest(opts);

        if (res.statusCode === 404) {
            return;
        }

        const data = res.body;
        delete data._id;

        return data;
    }


    _makeRequest(opts) {
        return new Promise((resolve, reject) => {
            request(opts, (err, res) => {
                if (err) {
                    return reject(err);
                }

                return resolve(res);
            });
        });
    }


    _makeRequestFail(opts) {
        return new Promise((resolve, reject) => {
            request(opts, (err, res) => {
                if (err) {
                    return reject(err);
                }

                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(res);
                }

                return resolve(res);
            });
        });
    }


    _makeRequestFailRetry(opts, retry) {
        return this
            ._makeRequestFail(opts)
            .catch((err) => {
                if (retry > 0) {
                    winston.error('Got error for url=', opts.url, ' / error=', err.message, ' / retry=', retry);

                    return Promise.delay(this._config.retryDelay).then(() => this._makeRequestFailRetry(opts, retry -1));
                }

                throw err;
            })
        ;
    }


    _getID(opts) {
        const cleanOpts = simplify(opts);
        const data = JSON.stringify(cleanOpts);
        const sha = crypto.createHash('sha1');
        sha.update(data);
        return sha.digest('hex');

        ////////////

        function simplify(o2) {
            const o = _.merge({}, o2);

            if (!o.method) {
                o.method = 'GET';
            }

            if (o.baseUrl) {
                if (o.url) {
                    o.url = `${o.baseUrl}${o.url}`;
                }
                else {
                    o.url = o.baseUrl;
                }
                delete o.baseUrl;
            }

            return o;
        }
    }
}



////////////

module.exports = StoreClient;
