// SPDX-FileCopyrightText: 2023 XWiki CryptPad Team <contact@cryptpad.org> and contributors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

define([
    'jquery',
    '/api/config',
    '/customize/application_config.js',
    '/components/chainpad-crypto/crypto.js',
    '/common/toolbar.js',
    '/components/nthen/index.js',
    '/common/sframe-common.js',
    '/common/hyperscript.js',
    '/customize/messages.js',
    '/common/common-interface.js',
    '/common/common-ui-elements.js',
    '/common/common-util.js',
    '/common/common-hash.js',
    '/common/common-signing-keys.js',
    '/support/ui.js',
    '/common/clipboard.js',
    'json.sortify',

    'css!/lib/datepicker/flatpickr.min.css',
    'css!/components/bootstrap/dist/css/bootstrap.min.css',
    'css!/components/components-font-awesome/css/font-awesome.min.css',
    'less!/moderation/app-moderation.less',
], function (
    $,
    ApiConfig,
    AppConfig,
    Crypto,
    Toolbar,
    nThen,
    SFCommon,
    h,
    Messages,
    UI,
    UIElements,
    Util,
    Hash,
    Keys,
    Support,
    Clipboard,
    Sortify
    )
{
    var APP = {
        'instanceStatus': {}
    };

    var Nacl = window.nacl;
    var common;
    var sFrameChan;
    var events = {
        'NEW_TICKET': Util.mkEvent(),
        'UPDATE_TICKET': Util.mkEvent()
    };

    var andThen = function (linkedTicket) {
        var $body = $('#cp-content-container');
        var button = h('button.btn.btn-primary', 'refresh'); // XXX
        $body.append(h('div', button));
        var $container = $(h('div.cp-support-container')).appendTo($body);


        let open = [];
        let refresh = () => {
            APP.module.execCommand('LIST_TICKETS_ADMIN', {}, (tickets) => {
                let activeForms = {};
                $container.find('.cp-support-form-container').each((i, el) => {
                    let id = $(el).attr('data-id');
                    if (!id) { return; }
                    activeForms[id] = el;
                });
                $container.empty();
                var col1 = h('div.cp-support-column', h('h1', [
                    h('span', Messages.admin_support_premium),
                    h('span.cp-support-count'),
                ]));
                var col2 = h('div.cp-support-column', h('h1', [
                    h('span', Messages.admin_support_normal),
                    h('span.cp-support-count'),
                ]));
                var col3 = h('div.cp-support-column', h('h1', [
                    h('span', Messages.admin_support_answered),
                    h('span.cp-support-count'),
                ]));
                $container.append([col1, col2, col3]);
                var sortTicket = function (c1, c2) {
                    return tickets[c2].time - tickets[c1].time;
                };

                const onShow = function (ticket, channel, data, done) {
                    APP.module.execCommand('LOAD_TICKET_ADMIN', {
                        channel: channel,
                        curvePublic: data.authorKey
                    }, function (obj) {
                        if (!Array.isArray(obj)) {
                            console.error(obj && obj.error);
                            done();
                            return void UI.warn(Messages.error);
                        }
                        obj.forEach(function (msg) {
                            if (!data.notifications) {
                                data.notifications = Util.find(msg, ['sender', 'notifications']);
                            }
                            $(ticket).append(APP.support.makeMessage(msg));
                        });
                        if (!open.includes(channel)) { open.push(channel); }
                        done();
                    });
                };
                const onHide = function (ticket, channel, data, done) {
                    $(ticket).find('.cp-support-list-message').remove();
                    open = open.filter((chan) => {
                        return chan !== channel;
                    });
                    done();
                };
                const onClose = function (ticket, channel, data) {
                    APP.module.execCommand('CLOSE_TICKET_ADMIN', {
                        channel: channel,
                        curvePublic: data.authorKey
                    }, function (obj) {
                        // XXX TODO
                    });
                };
                const onReply = function (ticket, channel, data, form, cb) {
                    // XXX TODO
                    var formData = APP.support.getFormData(form);
                    APP.module.execCommand('REPLY_TICKET_ADMIN', {
                        channel: channel,
                        curvePublic: data.authorKey,
                        notifChannel: data.notifications,
                        ticket: formData
                    }, function (obj) {
                        if (obj && obj.error) {
                            console.error(obj && obj.error);
                            return void UI.warn(Messages.error);
                        }
                        $(ticket).find('.cp-support-list-message').remove();
                        $(ticket).find('.cp-support-form-container').remove();
                        refresh();
                    });
                };

                Object.keys(tickets).sort(sortTicket).forEach(function (channel) {
                    var d = tickets[channel];
                    var ticket = APP.support.makeTicket({
                        id: channel,
                        content: d,
                        form: activeForms[channel],
                        onShow, onHide, onClose, onReply
                    });

                    var container;
                    if (d.lastAdmin) { container = col3; }
                    else if (d.premium) { container = col1; }
                    else { container = col2; }
                    $(container).append(ticket);

                    if (open.includes(channel)) { return void ticket.open(); }
                    if (linkedTicket === channel) {
                        linkedTicket = undefined;
                        ticket.open();
                        ticket.scrollIntoView();
                    }
                });
                open = [];
                console.log(tickets);
            });
        };
        let _refresh = Util.throttle(refresh, 500);
        Util.onClickEnter($(button), function () {
            refresh();
        });
        events.NEW_TICKET.reg(_refresh);
        events.UPDATE_TICKET.reg(_refresh); // XXX dont refresh all?
        refresh();
    };

    var createToolbar = function () {
        var displayed = ['useradmin', 'newpad', 'limit', 'pageTitle', 'notifications'];
        var configTb = {
            displayed: displayed,
            sfCommon: common,
            $container: APP.$toolbar,
            pageTitle: Messages.supportPage,
            metadataMgr: common.getMetadataMgr(),
        };
        APP.toolbar = Toolbar.create(configTb);
        APP.toolbar.$rightside.hide();
    };

    nThen(function (waitFor) {
        $(waitFor(UI.addLoadingScreen));
        SFCommon.create(waitFor(function (c) { APP.common = common = c; }));
    }).nThen(function (waitFor) {
        APP.$container = $('#cp-content-container');
        APP.$toolbar = $('#cp-toolbar');
        sFrameChan = common.getSframeChannel();
        sFrameChan.onReady(waitFor());
    }).nThen(function (/*waitFor*/) {
        createToolbar();
        var metadataMgr = common.getMetadataMgr();
        var privateData = metadataMgr.getPrivateData();
        common.setTabTitle(Messages.supportPage);

        if (!common.isAdmin()) {
            return void UI.errorLoadingScreen(Messages.admin_authError || '403 Forbidden');
        }

        APP.privateKey = privateData.supportPrivateKey;
        APP.origin = privateData.origin;
        APP.readOnly = privateData.readOnly;
        APP.module = common.makeUniversal('support', {
            onEvent: (obj) => {
                let cmd = obj.ev;
                let data = obj.data;
                if (!events[cmd]) { return; }
                events[cmd].fire(data);
            }
        });
        APP.support = Support.create(common, true);

        let active = privateData.category || 'active';
        let linkedTicket;
        if (active.indexOf('-') !== -1) {
            linkedTicket = active.split('-')[1];
            active = active.split('-')[0];
        }

        andThen(linkedTicket);
        UI.removeLoadingScreen();

    });
});
