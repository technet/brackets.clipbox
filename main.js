
// This is simple extension which remembers copied texts and allow you to access them and paste back.
// Author: technetlk@gmail.com (https://github.com/technet/brackets.clipbox, http://tutewall.com)

/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, _, Mustache */
define(function (require, exports, module) {
    "use strict";
    
    var AppInit             = brackets.getModule("utils/AppInit"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        KeyEvent            = brackets.getModule("utils/KeyEvent"),
        CommandManager      = brackets.getModule("command/CommandManager"),
        Menus               = brackets.getModule("command/Menus"),
        ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        QuickOpen           = brackets.getModule("search/QuickOpen"),
        Dialogs             = brackets.getModule("widgets/Dialogs"),
        StringUtils         = brackets.getModule("utils/StringUtils");

    var _                   = require("vendor/lodash");


    var filterEnabled       = false,                        // Future feature.
        clipBoxData         = [],
        quickOpenHotKey     = "Ctrl-Alt-V",
        clearClipBoxHotKey  = "Ctrl-Alt-E",
        quickOpenMatch      = '#',
        maxClipBoxSize      = 10,                           // Maximum number of history entries, if you think you need more just increase.
        lastKey             = 0;
    
    var settingsDlgTemplate = require("text!templates/settings.html");
    var ExtStrings          = require("strings");

    // Constants
    var EXT_NAME                        = "technet.clipbox",
        EXT_PREF_HISTORY_SIZE           = "size",
        EXT_PREF_OPEN_HOTKEY            = "openkey",
        EXT_PREF_CLEAR_HOTKEY           = "clearkey",
        QUICKOPEN_LABEL                 = "ClipBox",
        CMDID_SHOWCLIPBOX               = EXT_NAME + "-" + "show.history",      // Command Id for showging history of copied texts
        CMDID_CLEARCLIPBOX              = EXT_NAME + "-" + "clear.history",     // Command Id to clear the history
        CMDID_CLIPBOXSETTINGS           = EXT_NAME + "-" + "settings",          // Command Id to show settings dialog
    
        KEY_EVENT_TYPE_DOWN             = "keydown",
        KEY_EVENT_TYPE_UP               = "keyup",

        MAX_QUICKOPEN_ENTRY_LEN         = 200;                                  // Maximum length of copied text to be displayed in each entry of QuickOpen list.

    var prefs               = PreferencesManager.getExtensionPrefs(EXT_NAME);


    function saveSelection(editor) {
        var selectedText = editor.getSelectedText(true);
        if (selectedText !== "") {
            clipBoxData.unshift(selectedText);
            if (clipBoxData.length > maxClipBoxSize) {
                clipBoxData.pop();
            }
        }
    }

    // We could have used KeyBindingManager for Ctrl+C however bracket source itself ignore this and let syatem to handle. So I didn't
    // want to mess with that. But the opportunity is there
    // https://github.com/adobe/brackets/blob/master/src/editor/EditorCommandHandlers.js#L1106
    var keyEventHandler = function ($event, editor, event) {
        
        //console.log(event.type + " " + event.keyCode + " " + event.metaKey);
        
        if (event.keyCode === KeyEvent.DOM_VK_CONTROL) {
            if (event.type === KEY_EVENT_TYPE_DOWN) {
                lastKey = 1;
            } else if (event.type === KEY_EVENT_TYPE_UP) {
                lastKey = -1;
            }
        } else if (event.keyCode === KeyEvent.DOM_VK_C && lastKey !== 0 && event.type === KEY_EVENT_TYPE_UP) {
            // I need to handle Ctrl+X as well however by the time we handle it edit already lost its data, so cannot retain it
            // in our store. If we know how to access clipboard then this could be done because data is there in the clipboard.
            lastKey = 0;
            saveSelection(editor);
        } else {
            lastKey = 0;
        }
    };
    
    function clearClipboard() {
        clipBoxData = [];
    }

    
    var activeEditorChangeHandler = function ($event, focusedEditor, lostEditor) {
        if (lostEditor) {
            $(lostEditor).off("keyEvent", keyEventHandler);
        }

        if (focusedEditor) {
            $(focusedEditor).on("keyEvent", keyEventHandler);
        }
    };
    
    function beginClipBoxSearch() {
        QuickOpen.beginSearch(quickOpenMatch);
    }

    function applyAndSaveSettings(settingsDlg) {

        var $body = settingsDlg.getElement();
        var maxEntries = $body.find("#max-entries").val().trim();
        var openHotKey = $body.find("#qopen-shortcut").val().trim();
        var clearHotKey = $body.find("#clear-shortcut").val().trim();
        var modified = false;

        try {

            var temp = parseInt(maxEntries, 10);
            if (temp > 0 && temp !== maxClipBoxSize) {
                maxClipBoxSize = temp;
                clipBoxData = clipBoxData.length > maxClipBoxSize ? clipBoxData.slice(0, maxClipBoxSize) : clipBoxData;
                prefs.set(EXT_PREF_HISTORY_SIZE, maxClipBoxSize);
                modified = true;
            }

            if (openHotKey.length > 0 && openHotKey !== quickOpenHotKey) {
                quickOpenHotKey = openHotKey;
                prefs.set(EXT_PREF_OPEN_HOTKEY, quickOpenHotKey);
                modified = true;
            }

            if (clearHotKey.length > 0 && clearHotKey !== clearClipBoxHotKey) {
                clearClipBoxHotKey = clearHotKey;
                prefs.set(EXT_PREF_CLEAR_HOTKEY, clearClipBoxHotKey);
                modified = true;
            }

            if (modified) {
                prefs.save();
            }

        } catch (ex) {

            console.log(ex.message);
        }

    }

    function showSettingsDialog() {
        // Will also add settings...
        ExtStrings.settings = { "maxClipBoxSize" : maxClipBoxSize, "quickOpenHotKey" : quickOpenHotKey, "clearClipBoxHotKey" : clearClipBoxHotKey  };

        var localizedTemplate = Mustache.render(settingsDlgTemplate, ExtStrings);
        var settingsDlg = Dialogs.showModalDialogUsingTemplate(localizedTemplate);


        settingsDlg.done(function (buttonId) {
            if (buttonId === "ok") {
                applyAndSaveSettings(settingsDlg);
            }
        });
    }

    function buildCommands() {

        var editMenu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);
        CommandManager.register(ExtStrings.MNU_SHOW_CLIPBOX, CMDID_SHOWCLIPBOX, beginClipBoxSearch);
        CommandManager.register(ExtStrings.MNU_CLEAR_CLIPBOX, CMDID_CLEARCLIPBOX, clearClipboard);
        CommandManager.register(ExtStrings.MNU_SETTINGS, CMDID_CLIPBOXSETTINGS, showSettingsDialog);

        editMenu.addMenuDivider();
        
        editMenu.addMenuItem(CMDID_SHOWCLIPBOX, quickOpenHotKey);
        editMenu.addMenuItem(CMDID_CLEARCLIPBOX, clearClipBoxHotKey);
        editMenu.addMenuItem(CMDID_CLIPBOXSETTINGS);
    }

    function searchClipBox(query, matcher) {

        if (filterEnabled && query !== "#") {
            query = query.substr(1);  // lose the "#" prefix
            var stringMatch = (matcher && matcher.match) ? matcher.match.bind(matcher) : QuickOpen.stringMatch;
            var filtered = _.filter(clipBoxData, function (entry) {
                var matchData =  stringMatch(entry, query);
                return (matchData ? true : false);
            });
            return filtered;
        } else {
            return clipBoxData.slice(0);
        }
    }

    function matchClipBoxEntry(query) {
        return query[0] === quickOpenMatch;
    }

    function clipEntrySelect(selectedItem) {
        if (selectedItem) {
            var editor = EditorManager.getCurrentFullEditor();
            var currentSelection = editor.getSelection();
            //https://github.com/adobe/brackets/commit/984ed97ddd0a00e3b4d394e55d68a8b7e281326b   https://github.com/adobe/brackets/issues/1688
            //editor.document.replaceRange(completion, start, end);
            editor._codeMirror.replaceRange(selectedItem, currentSelection.start, currentSelection.end);
        }
    }

    function clipEntryFormatter(item, query) {
        var trimmed = $.trim(item);
        var shortText = trimmed.length === 0 ? ExtStrings.TXT_BLANK : (trimmed.length > MAX_QUICKOPEN_ENTRY_LEN ? StringUtils.truncate(trimmed, MAX_QUICKOPEN_ENTRY_LEN) : trimmed);
        // var formattedText = QuickOpen.highlightMatch(shortText);
        return StringUtils.format("<li>{0}</li>", _.escape(shortText));
    }

    function quickClipBoxDone() {
    }

    function buildQuickOpen() {

        QuickOpen.addQuickOpenPlugin(
            {
                name: EXT_NAME,
                label: QUICKOPEN_LABEL,
                languageIds: [],
                fileTypes: [],
                done: quickClipBoxDone,
                search : searchClipBox,
                match : matchClipBoxEntry,
                itemFocus: function () {},
                itemSelect: clipEntrySelect,
                resultsFormatter: clipEntryFormatter,
                matcherOptions: { segmentedSearch: false }
            }
        );
    }

    function loadPreferences() {

        var temp = prefs.get(EXT_PREF_HISTORY_SIZE);
        if (!_.isNaN(temp) && temp > 0) {
            maxClipBoxSize = temp;
        }

        temp = prefs.get(EXT_PREF_CLEAR_HOTKEY);
        if (!_.isUndefined(temp) && temp.length > 0) {
            clearClipBoxHotKey = temp;
        }

        temp = prefs.get(EXT_PREF_OPEN_HOTKEY);
        if (!_.isUndefined(temp) && temp.length > 0) {
            quickOpenHotKey = temp;
        }
    }


    AppInit.appReady(function () {
        
        var currentEditor = EditorManager.getCurrentFullEditor();
        ExtensionUtils.loadStyleSheet(module, "styles/settings.css");

        $(currentEditor).on('keyEvent', keyEventHandler);
        $(EditorManager).on('activeEditorChange', activeEditorChangeHandler);
        loadPreferences();
        buildCommands();
        buildQuickOpen();
    });
});
