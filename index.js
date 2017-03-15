'use strict';

var cache = Object.create(null);
var debug = false;
var hitCount = 0;
var missCount = 0;
var size = 0;

exports.put = function(key, value, time, timeoutCallback) {
  if (debug) {
    console.log('caching: %s = %j (@%s)', key, value, time);
  }

  if (typeof time !== 'undefined' && (typeof time !== 'number' || isNaN(time) || time <= 0)) {
    throw new Error('Cache timeout must be a positive number');
  } else if (typeof timeoutCallback !== 'undefined' && typeof timeoutCallback !== 'function') {
    throw new Error('Cache timeout callback must be a function');
  }

  var oldRecord = cache[key];
  if (oldRecord) {
    clearTimeout(oldRecord.timeout);
  } else {
    size++;
  }

  var record = {
    value: value,
    expire: time + Date.now()
  };

  if (!isNaN(record.expire)) {
    record.timeout = setTimeout(function() {
      _del(key);
      if (timeoutCallback) {
        timeoutCallback(key, value);
      }
    }, time);
  }

  cache[key] = record;

  return value;
};

exports.del = function(key) {
  var canDelete = true;

  var oldRecord = cache[key];
  if (oldRecord) {
    clearTimeout(oldRecord.timeout);
    if (!isNaN(oldRecord.expire) && oldRecord.expire < Date.now()) {
      canDelete = false;
    }
  } else {
    canDelete = false;
  }

  if (canDelete) {
    _del(key);
  }

  return canDelete;
};

function _del(key){
  size--;
  delete cache[key];
}

exports.clear = function() {
  for (var key in cache) {
    clearTimeout(cache[key].timeout);
  }
  size = 0;
  cache = Object.create(null);
  if (debug) {
    hitCount = 0;
    missCount = 0;
  }
};

exports.get = function(key) {
  var data = cache[key];
  if (typeof data != "undefined") {
    if (isNaN(data.expire) || data.expire >= Date.now()) {
      if (debug) hitCount++;
      return data.value;
    } else {
      // free some space
      if (debug) missCount++;
      size--;
      delete cache[key];
    }
  } else if (debug) {
    missCount++;
  }
  return null;
};

exports.size = function() {
  return size;
};

exports.memsize = function() {
  var size = 0,
    key;
  for (key in cache) {
    size++;
  }
  return size;
};

exports.debug = function(bool) {
  debug = bool;
};

exports.hits = function() {
  return hitCount;
};

exports.misses = function() {
  return missCount;
};

exports.keys = function() {
  return Object.keys(cache);
};

exports.exportJson = function() {
  var plainJsCache = {};

  // Discard the `timeout` property.
  // Note: JSON doesn't support `NaN`, so convert it to `'NaN'`.
  for (var key in cache) {
    var record = cache[key];
    plainJsCache[key] = {
      value: record.value,
      expire: record.expire || 'NaN',
    };
  }

  return JSON.stringify(plainJsCache);
};

exports.importJson = function(jsonToImport, options) {
  var cacheToImport = JSON.parse(jsonToImport);
  var currTime = Date.now();

  var skipDuplicates = options && options.skipDuplicates;

  for (var key in cacheToImport) {
    if (cacheToImport.hasOwnProperty(key)) {
      if (skipDuplicates) {
        var existingRecord = cache[key];
        if (existingRecord) {
          if (debug) {
            console.log('Skipping duplicate imported key \'%s\'', key);
          }
          continue;
        }
      }

      var record = cacheToImport[key];

      // record.expire could be `'NaN'` if no expiry was set.
      // Try to subtract from it; a string minus a number is `NaN`, which is perfectly fine here.
      var remainingTime = record.expire - currTime;

      if (remainingTime <= 0) {
        // Delete any record that might exist with the same key, since this key is expired.
        exports.del(key);
        continue;
      }

      // Remaining time must now be either positive or `NaN`,
      // but `put` will throw an error if we try to give it `NaN`.
      remainingTime = remainingTime > 0 ? remainingTime : undefined;

      exports.put(key, record.value, remainingTime);
    }
  }

  return exports.size();
};
