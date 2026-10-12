/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

/**
 * The URL query parameters.  One or more of the following:
 *
 *    args (gets split from comma-separated list to Array)
 *    gamepad
 *    icc_mcc
 *    icc_mnc
 *    icc_msisdn
 *    jad
 *    jars
 *    logConsole
 *    logLevel
 *    main
 *    midletClassName
 *    network_mcc
 *    network_mnc
 *    platform
 *    autosize
 *    fontSize
 *    language
 *    forceRuntimeCompilation
 *    deferStartup - Number of milliseconds to wait after loading JS sources and before starting the VM.
 *
 * Keep this list up-to-date!
 */

(function() {
  var params = {};

  location.search.substring(1).split("&").forEach(function (param) {
    param = param.split("=").map(function(v) {
      return v.replace(/\+/g, " ");
    }).map(decodeURIComponent);
    params[param[0]] = param[1];
  });

  if (params.jar && !params.jars) {
    var j = params.jar;
    if (!j.startsWith('/') && !j.startsWith('http')) {
      j = '/jar/' + j;
    }
    params.jars = j;
  }
  if (params.jars) {
    if (!params.jars.startsWith('/') && !params.jars.startsWith('http') && !params.jars.startsWith('jar/')) {
      params.jars = '/jar/' + params.jars;
    }
  }

  if ("midletClassName" in params) {
    params.midletClassName = params.midletClassName.replace(/\//g, '.');
  }

  for (var name in params) {
    config[name] = params[name];
  }
})();
