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

$(document).ready(function () {
  prepareAppBucketTree();
  $('#refreshBuckets').click(function () {
    $('#appBuckets').jstree(true).refresh();
  });

  $('#createNewBucket').click(function () {
    createNewBucket();
  });

  $('#submitTranslation').click(function () {
    var treeNode = $('#appBuckets').jstree(true).get_selected(true)[0];
    submitTranslation(treeNode);
  });

  $('#createBucketModal').on('shown.bs.modal', function () {
    $("#newBucketKey").focus();
  });

  $('#CompositeTranslationModal').on('shown.bs.modal', function () {
    $("#rootDesignFilename").focus();
  });

  $('#hiddenUploadField').change(function () {
    var node = $('#appBuckets').jstree(true).get_selected(true)[0];
    var _this = this;
    if (_this.files.length == 0) return;
    var file = _this.files[0];
    switch (node.type) {
      case 'bucket':
        var formData = new FormData();
        formData.append('fileToUpload', file);
        formData.append('bucketKey', node.id);

        $.ajax({
          url: '/api/forge/oss/objects',
          data: formData,
          processData: false,
          contentType: false,
          type: 'POST',
          success: function (data) {
            $('#appBuckets').jstree(true).refresh_node(node);
            _this.value = '';
          }
        });
        break;
    }
  });
});

function createNewBucket() {
  var bucketKey = $('#newBucketKey').val();
  var policyKey = $('#newBucketPolicyKey').val();
  jQuery.post({
    url: '/api/forge/oss/buckets',
    contentType: 'application/json',
    data: JSON.stringify({ 'bucketKey': bucketKey, 'policyKey': policyKey }),
    success: function (res) {
      $('#appBuckets').jstree(true).refresh();
      $('#createBucketModal').modal('toggle');
    },
    error: function (err) {
      if (err.status == 409)
        alert('Bucket already exists - 409: Duplicated')
      console.log(err);
    }
  });
}

function prepareAppBucketTree() {
  $('#appBuckets').jstree({
    'core': {
      'themes': { "icons": true },
      'data': {
        "url": '/api/forge/oss/buckets',
        "dataType": "json",
        'multiple': false,
        "data": function (node) {
          return { "id": node.id };
        }
      }
    },
    'types': {
      'default': {
        'icon': 'glyphicon glyphicon-question-sign'
      },
      '#': {
        'icon': 'glyphicon glyphicon-cloud'
      },
      'bucket': {
        'icon': 'glyphicon glyphicon-folder-open'
      },
      'object': {
        'icon': 'glyphicon glyphicon-file'
      }
    },
    "plugins": ["types", "state", "sort", "contextmenu"],
    contextmenu: { items: autodeskCustomMenu }
  }).on('loaded.jstree', function () {
    $('#appBuckets').jstree('open_all');
  }).bind("activate_node.jstree", function (evt, data) {
    if (data != null && data.node != null && data.node.type == 'object') {
      $("#forgeViewer").empty();
      var urn = data.node.id;
      jQuery.ajax({
        url: '/api/forge/modelderivative/manifest/' + urn,
        success: function (res) {
          if (res.progress === 'success' || res.progress === 'complete') launchViewer(urn);
          else $("#forgeViewer").html('The translation job still running: ' + res.progress + '. Please try again in a moment.');
        },
        error: function (err) {
          var msgButton = 'This file is not translated yet! ' +
            '<button class="btn btn-xs btn-info" onclick="translateObject()"><span class="glyphicon glyphicon-eye-open"></span> ' +
            'Start translation</button>'
          $("#forgeViewer").html(msgButton);
        }
      });
    }
  });
}

function autodeskCustomMenu(autodeskNode) {
  var items;

  switch (autodeskNode.type) {
    case "bucket":
      items = {
        uploadFile: {
          label: "Upload file",
          action: function () {
            uploadFile();
          },
          icon: 'glyphicon glyphicon-cloud-upload'
        }
      };
      break;
    case "object":
      items = {
        translateFile: {
          label: "Translate",
          action: function () {
            var treeNode = $('#appBuckets').jstree(true).get_selected(true)[0];
            translateObject(treeNode);
          },
          icon: 'glyphicon glyphicon-eye-open'
        }
      };
      break;
  }

  return items;
}

function uploadFile() {
  $('#hiddenUploadField').click();
}

function submitTranslation(node) {
  $("#forgeViewer").empty();
  if (node == null) node = $('#appBuckets').jstree(true).get_selected(true)[0];
  var bucketKey = node.parents[0];
  var objectKey = node.id;
  var rootDesignFilename = $('#rootDesignFilename').val();
  var isSvf2 = $('#outputFormat :selected').text() === 'SVF2';
  var xAdsForce = ($('#xAdsForce').is(':checked') === true);
  var data = { 'bucketKey': bucketKey, 'objectName': objectKey, 'isSvf2': (isSvf2 === true), 'xAdsForce': xAdsForce };

  if((rootDesignFilename && rootDesignFilename.trim() && rootDesignFilename.trim().length > 0)) {
    data.rootFilename = rootDesignFilename;
    data.compressedUrn = true;
  }

  jQuery.post({
    url: '/api/forge/modelderivative/jobs',
    contentType: 'application/json',
    data: JSON.stringify(data),
    success: function (res) {
      $('#CompositeTranslationModal').modal('hide');
      $("#forgeViewer").html('Translation started! Please try again in a moment.');
    },
  });
}

function translateObject() {
  $('#CompositeTranslationModal').modal('show');
}