'use strict';

var async = require('async');

var user = require('../../user');
var categories = require('../../categories');
var accountHelpers = require('./helpers');

var categoriesController = module.exports;

categoriesController.get = function (req, res, callback) {
	var userData;
	async.waterfall([
		function (next) {
			accountHelpers.getUserDataByUserSlug(req.params.userslug, req.uid, next);
		},
		function (_userData, next) {
			userData = _userData;
			if (!userData) {
				return callback();
			}

			async.parallel({
				ignored: function (next) {
					user.getIgnoredCategories(userData.uid, next);
				},
				categories: function (next) {
					categories.buildForSelect(userData.uid, 'find', next);
				},
			}, next);
		},
		function (results) {
			results.categories.forEach(function (category) {
				if (category) {
					category.isIgnored = results.ignored.includes(String(category.cid));
				}
			});
			userData.categories = results.categories;
			userData.title = '[[pages:account/watched_categories, ' + userData.username + ']]';
			res.render('account/categories', userData);
		},
	], callback);
};
