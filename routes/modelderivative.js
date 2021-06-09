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

const express = require('express');
const {
    DerivativesApi,
    JobPayload,
    JobPayloadInput,
    JobPayloadOutput,
    JobSvfOutputPayload
} = require('forge-apis');

const { getClient, getInternalToken } = require('./common/oauth');

let router = express.Router();

// Middleware for obtaining a token for each request.
router.use(async (req, res, next) => {
    const token = await getInternalToken();
    req.oauth_token = token;
    req.oauth_client = getClient();
    next();
});

/**
  * Returns information about derivatives that correspond to a specific source file, including derviative URNs and statuses.  The URNs of the derivatives are used to download the generated derivatives when calling the [GET {urn}/manifest/{derivativeurn}](https://developer.autodesk.com/en/docs/model-derivative/v2/reference/http/urn-manifest-derivativeurn-GET) endpoint.  The statuses are used to verify whether the translation of requested output files is complete.  Note that different output files might complete their translation processes at different times, and therefore may have different &#x60;status&#x60; values.  When translating a source file a second time, the previously created manifest is not deleted; it appends the information (only new translations) to the manifest. 
  * @param {String} urn The Base64 (URL Safe) encoded design URN 
  * @param {Object} opts Optional parameters
  * @param {String} opts.acceptEncoding If specified with `gzip` or `*`, content will be compressed and returned in a GZIP format. 
  * data is of type: {module:model/Manifest}
  * @param {Object} oauth2client oauth2client for the call
  * @param {Object} credentials credentials for the call
  */
 const derivativesApi = new DerivativesApi();
 const manifestFile = function(encodedURN, oauth2client, credentials) {
    return new Promise(function(resolve, reject) {
        derivativesApi.getManifest(encodedURN, {}, oauth2client, credentials).then(
            function(res) {
                resolve(res);
            },
            function(err) {
                reject(err);
            }
        )
    });
}

router.get('/manifest/:urn', async (req, res, next) => {
    try {
        const response = await manifestFile(req.params.urn, req.oauth_client, req.oauth_token);
        res.json(response.body);
    } catch(err) {
        next(err);
    }
});

// POST /api/forge/modelderivative/jobs - submits a new translation job for given object URN.
// Request body must be a valid JSON in the form of { "objectName": "<translated-object-urn>" }.
router.post('/jobs', async (req, res, next) => {
    const xAdsForce = (req.body.xAdsForce === true);
    let job = new JobPayload();
    job.input = new JobPayloadInput();
    job.input.urn = req.body.objectName;
    if(req.body.rootFilename && req.body.compressedUrn) {
        job.input.rootFilename = req.body.rootFilename;
        job.input.compressedUrn = req.body.compressedUrn;
    }

    job.output = new JobPayloadOutput([
        new JobSvfOutputPayload()
    ]);
    job.output.formats[0].type = (req.body.isSvf2 == true) ? 'svf2' : 'svf';
    job.output.formats[0].views = ['2d', '3d'];
    try {
        // Submit a translation job using [DerivativesApi](https://github.com/Autodesk-Forge/forge-api-nodejs-client/blob/master/docs/DerivativesApi.md#translate).
        const result = await derivativesApi.translate(job, { xAdsForce: xAdsForce }, req.oauth_client, req.oauth_token);
        res.status(200).end();
    } catch(err) {
        next(err);
    }
});

module.exports = router;
