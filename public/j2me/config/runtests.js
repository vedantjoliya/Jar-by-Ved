// runtests config (empty by default, configured via urlparams)
MIDlet.shouldStartBackgroundService = function() {
  return typeof fs !== 'undefined' && fs.exists && fs.exists("/startBackgroundService");
};
