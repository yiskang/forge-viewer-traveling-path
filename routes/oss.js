/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Forge Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

const fs = require('fs');
const express = require('express');
const multer  = require('multer');
const async = require('async');
const guid = require('guid');
const { BucketsApi, ObjectsApi, PostBucketsPayload } = require('forge-apis');

const { getClient, getInternalToken } = require('./common/oauth');
const config = require('../config');

let router = express.Router();

// Middleware for obtaining a token for each request.
router.use(async (req, res, next) => {
    const token = await getInternalToken();
    req.oauth_token = token;
    req.oauth_client = getClient();
    next();
});

// GET /api/forge/oss/buckets - expects a query param 'id'; if the param is '#' or empty,
// returns a JSON with list of buckets, otherwise returns a JSON with list of objects in bucket with given name.
router.get('/buckets', async (req, res, next) => {
    const bucket_name = req.query.id;
    if (!bucket_name || bucket_name === '#') {
        try {
            // Retrieve up to 100 buckets from Forge using the [BucketsApi](https://github.com/Autodesk-Forge/forge-api-nodejs-client/blob/master/docs/BucketsApi.md#getBuckets)
            // Note: if there's more buckets, you should call the getBucket method in a loop, providing different 'startAt' params
            const buckets = await new BucketsApi().getBuckets({ limit: 100 }, req.oauth_client, req.oauth_token);
            res.json(buckets.body.items.map((bucket) => {
                return {
                    id: bucket.bucketKey,
                    // Remove bucket key prefix that was added during bucket creation
                    text: bucket.bucketKey.replace(config.credentials.client_id.toLowerCase() + '-', ''),
                    type: 'bucket',
                    children: true
                };
            }));
        } catch(err) {
            next(err);
        }
    } else {
        try {
            // Retrieve up to 100 objects from Forge using the [ObjectsApi](https://github.com/Autodesk-Forge/forge-api-nodejs-client/blob/master/docs/ObjectsApi.md#getObjects)
            // Note: if there's more objects in the bucket, you should call the getObjects method in a loop, providing different 'startAt' params
            const objects = await new ObjectsApi().getObjects(bucket_name, { limit: 100 }, req.oauth_client, req.oauth_token);
            res.json(objects.body.items.map((object) => {
                return {
                    id: Buffer.from(object.objectId).toString('base64'),
                    text: object.objectKey,
                    type: 'object',
                    children: false
                };
            }));
        } catch(err) {
            next(err);
        }
    }
});

// POST /api/forge/oss/buckets - creates a new bucket.
// Request body must be a valid JSON in the form of { "bucketKey": "<new_bucket_name>" }.
router.post('/buckets', async (req, res, next) => {
    let payload = new PostBucketsPayload();
    payload.bucketKey = config.credentials.client_id.toLowerCase() + '-' + req.body.bucketKey;
    payload.policyKey = 'transient'; // expires in 24h
    try {
        // Create a bucket using [BucketsApi](https://github.com/Autodesk-Forge/forge-api-nodejs-client/blob/master/docs/BucketsApi.md#createBucket).
        await new BucketsApi().createBucket(payload, {}, req.oauth_client, req.oauth_token);
        res.status(200).end();
    } catch(err) {
        next(err);
    }
});

/**
 * Upload a File to previously created bucket.
 * Uses the oAuth2TwoLegged object that you retrieved previously.
 * @param bucketKey
 * @param filePath
 * @param fileName
 * @returns {Promise}
 */
const uploadFileChunk = function(bucketKey, filePath, fileName, oauth2client, credentials) {
    return new Promise(function(resolve, reject) {
        const objectsApi = new ObjectsApi();

        fs.readFile(filePath, function(err, data) {
            if (err) {
                reject(err);
            } else {
                let chunkSize = 5 * 1024 * 1024
                let nbChunks = Math.ceil(data.length / chunkSize)
                let chunksMap = Array.from({
                    length: nbChunks
                }, (e, i) => i)

                // generates uniques session ID
                let sessionId = guid.create();
                let uploadChuckArray = [];

                let range;
                let readStream;

                // prepare the upload tasks
                chunksMap.map((chunkIdx) => {
                    let start = chunkIdx * chunkSize
                    let end = Math.min(data.length, (chunkIdx + 1) * chunkSize) - 1;

                    if (chunkIdx == (nbChunks - 1)) {
                        chunkSize = data.length - start; // Change the final content-length chunk since it will have a smaller number of bytes on last chunk
                    }

                    range = `bytes ${start}-${end}/${data.length}`
                    readStream = fs.createReadStream(filePath, {
                        start,
                        end
                    })

                    chunksMap.forEach(function(chunk) {
                        uploadChuckArray.push(function(callback) {
                            console.log('**** Uploading Chunks ***** with Range ', range);

                            // Upload an object chunks to bucket using [ObjectsApi](https://github.com/Autodesk-Forge/forge-api-nodejs-client/blob/master/docs/ObjectsApi.md#uploadchunk).
                            objectsApi.uploadChunk(bucketKey, fileName, chunkSize, range, sessionId.value, readStream, {}, oauth2client, credentials)
                                .then(callback)
                                .catch(callback)
                        })
                    });

                    async.waterfall(uploadChuckArray, function(err, result) {
                        if (err.statusCode == 200) {
                            resolve(err)
                        }
                    })


                });
            }
        });
    })
}

/**
 * Upload a File to previously created bucket.
 * Uses the oAuth2TwoLegged object that you retrieved previously.
 * @param bucketKey
 * @param filePath
 * @param fileName
 * @returns {Promise}
 */
const uploadFile = function(bucketKey, filePath, fileName, oauth2client, credentials) {
    return new Promise(function(resolve, reject) {
        const objectsApi = new ObjectsApi();

        fs.readFile(filePath, function(err, data) {
            if (err) {
                reject(err);
            } else {
                // Upload an object to bucket using [ObjectsApi](https://github.com/Autodesk-Forge/forge-api-nodejs-client/blob/master/docs/ObjectsApi.md#uploadObject).
                objectsApi.uploadObject(bucketKey, fileName, data.length, data, {}, oauth2client, credentials).then(
                    function(res) {
                        resolve(res);
                    },
                    function(err) {
                        reject(err);
                    }
                )
            }
        });
    });
};

/**
 * Checker for Size of File, depending on size will run resumable upload or upload as a whole.
 * Uses the oAuth2TwoLegged object that you retrieved previously.
 * @param bucketKey
 * @param filePath
 * @param fileName
 */
const uploadFileCheck = function(bucketKey, filePath, fileName, oauth2client, credentials) {
    return new Promise(function(resolve, reject) {
        fs.readFile(filePath, function(err, data) {
            if (err) {
                reject(err);
            } else {
                if (data.length < 5242879) { // Less than 5MB files upload process
                    resolve(uploadFile(bucketKey, filePath, fileName, oauth2client, credentials));
                } else {
                    resolve(uploadFileChunk(bucketKey, filePath, fileName, oauth2client, credentials));
                }
            }
        })
    })
}

const deleteRawFile = function(path) {
    return new Promise(function(resolve, reject) {
        fs.unlink(path, (err) => {
            if (err) {
                return reject(err);
            }

            resolve();
        })
    });
}

// POST /api/forge/oss/objects - uploads new object to given bucket.
// Request body must be structured as 'form-data' dictionary
// with the uploaded file under "fileToUpload" key, and the bucket name under "bucketKey".
router.post('/objects', multer({ dest: 'uploads/' }).single('fileToUpload'), async (req, res, next) => {
    try {
        const result = await uploadFileCheck(req.body.bucketKey, req.file.path, req.file.originalname, req.oauth_client, req.oauth_token);
        await deleteRawFile(req.file.path);

        res.status(200).end();
    } catch(err) {
        next(err);
    }
});

module.exports = router;
