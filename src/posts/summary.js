
'use strict';

var async = require('async');
var validator = require('validator');
var _ = require('lodash');

var topics = require('../topics');
var user = require('../user');
var plugins = require('../plugins');
var categories = require('../categories');
var utils = require('../utils');

module.exports = function (Posts) {
	Posts.getPostSummaryByPids = function (pids, uid, options, callback) {
		if (!Array.isArray(pids) || !pids.length) {
			return callback(null, []);
		}

		options.stripTags = options.hasOwnProperty('stripTags') ? options.stripTags : false;
		options.parse = options.hasOwnProperty('parse') ? options.parse : true;
		options.extraFields = options.hasOwnProperty('extraFields') ? options.extraFields : [];

		var fields = ['pid', 'tid', 'content', 'uid', 'timestamp', 'deleted', 'upvotes', 'downvotes'].concat(options.extraFields);

		var posts;
		async.waterfall([
			function (next) {
				Posts.getPostsFields(pids, fields, next);
			},
			function (_posts, next) {
				posts = _posts.filter(Boolean);
				user.blocks.filter(uid, posts, next);
			},
			function (_posts, next) {
				posts = _posts;
				var uids = {};
				var topicKeys = {};

				posts.forEach(function (post) {
					uids[post.uid] = 1;
					topicKeys[post.tid] = 1;
				});
				async.parallel({
					users: function (next) {
						user.getUsersFields(Object.keys(uids), ['uid', 'username', 'userslug', 'picture'], next);
					},
					topicsAndCategories: function (next) {
						getTopicAndCategories(Object.keys(topicKeys), next);
					},
				}, next);
			},
			function (results, next) {
				results.users = toObject('uid', results.users);
				results.topics = toObject('tid', results.topicsAndCategories.topics);
				results.categories = toObject('cid', results.topicsAndCategories.categories);

				posts.forEach(function (post) {
					// If the post author isn't represented in the retrieved users' data, then it means they were deleted, assume guest.
					if (!results.users.hasOwnProperty(post.uid)) {
						post.uid = 0;
					}
					post.user = results.users[post.uid];
					post.topic = results.topics[post.tid];
					post.category = post.topic && results.categories[post.topic.cid];
					post.isMainPost = post.topic && post.pid === post.topic.mainPid;
					post.deleted = post.deleted === 1;
					post.timestampISO = utils.toISOString(post.timestamp);
				});

				posts = posts.filter(function (post) {
					return results.topics[post.tid];
				});

				parsePosts(posts, options, next);
			},
			function (posts, next) {
				plugins.fireHook('filter:post.getPostSummaryByPids', { posts: posts, uid: uid }, next);
			},
			function (data, next) {
				next(null, data.posts);
			},
		], callback);
	};

	function parsePosts(posts, options, callback) {
		async.map(posts, function (post, next) {
			async.waterfall([
				function (next) {
					if (!post.content || !options.parse) {
						post.content = post.content ? validator.escape(String(post.content)) : post.content;
						return next(null, post);
					}
					Posts.parsePost(post, next);
				},
				function (post, next) {
					if (options.stripTags) {
						post.content = stripTags(post.content);
					}
					next(null, post);
				},
			], next);
		}, callback);
	}

	function getTopicAndCategories(tids, callback) {
		var topicsData;
		async.waterfall([
			function (next) {
				topics.getTopicsFields(tids, ['uid', 'tid', 'title', 'cid', 'slug', 'deleted', 'postcount', 'mainPid'], next);
			},
			function (_topicsData, next) {
				topicsData = _topicsData;
				var cids = _.uniq(topicsData.map(topic => topic && topic.cid));
				categories.getCategoriesFields(cids, ['cid', 'name', 'icon', 'slug', 'parentCid', 'bgColor', 'color'], next);
			},
			function (categoriesData, next) {
				next(null, { topics: topicsData, categories: categoriesData });
			},
		], callback);
	}

	function toObject(key, data) {
		var obj = {};
		for (var i = 0; i < data.length; i += 1) {
			obj[data[i][key]] = data[i];
		}
		return obj;
	}

	function stripTags(content) {
		if (content) {
			return utils.stripHTMLTags(content, utils.stripTags);
		}
		return content;
	}
};
