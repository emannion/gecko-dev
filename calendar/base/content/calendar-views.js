/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Calendar views code
 *
 * The Initial Developer of the Original Code is
 *   the Mozilla Calendar Squad
 * Portions created by the Initial Developer are Copyright (C) 2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Vladimir Vukicevic <vladimir.vukicevic@oracle.com>
 *   Joey Minta <jminta@gmail.com>
 *   Michael Buettner <michael.buettner@sun.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var calendarViewController = {
    QueryInterface: function(aIID) {
        if (!aIID.equals(Components.interfaces.calICalendarViewController) &&
            !aIID.equals(Components.interfaces.nsISupports)) {
            throw Components.results.NS_ERROR_NO_INTERFACE;
        }

        return this;
    },

    createNewEvent: function (aCalendar, aStartTime, aEndTime) {
        // XXX If we're adding an item from the view, let's make sure that
        // XXX the calendar in question is visible!
        // XXX unify these
        if (!aCalendar) {
            if ("ltnSelectedCalendar" in window) {
                aCalendar = ltnSelectedCalendar();
            } else {
                aCalendar = getSelectedCalendarOrNull();
            }
        }

        // if we're given both times, skip the dialog
        if (aStartTime && aEndTime && !aStartTime.isDate && !aEndTime.isDate) {
            var event = createEvent();
            event.startDate = aStartTime;
            event.endDate = aEndTime;
            var sbs = Components.classes["@mozilla.org/intl/stringbundle;1"]
                                .getService(Components.interfaces.nsIStringBundleService);
            var props = sbs.createBundle("chrome://calendar/locale/calendar.properties");
            event.title = props.GetStringFromName("newEvent");
            setDefaultAlarmValues(event);
            doTransaction('add', event, aCalendar, null, null);
        } else if (aStartTime && aStartTime.isDate) {
            var event = createEvent();
            event.startDate = aStartTime;
            setDefaultAlarmValues(event);
            doTransaction('add', event, aCalendar, null, null);
        } else {
            // default pop up the dialog
            //XXX unify these
            if ("newEvent" in window) {
                // Sunbird specific code
                newEvent();
            } else {
                // Lightning specific code
                var date = document.getElementById("calendar-view-box").selectedPanel.selectedDay.clone();
                date.isDate = false;
                createEventWithDialog(aCalendar, date, date);
            }
        }
    },

    modifyOccurrence: function (aOccurrence, aNewStartTime, aNewEndTime) {
        // if we can modify this thing directly (e.g. just the time changed),
        // then do so; otherwise pop up the dialog
        var itemToEdit;
        if (aNewStartTime && aNewEndTime) {
            itemToEdit = getOccurrenceOrParent(aOccurrence);
            var instance = itemToEdit.clone();

            // if we're about to modify the parentItem, we need to account
            // for the possibility that the item passed as argument was
            // some other occurrence, but the user said she would like to
            // modify all ocurrences instead.  In that case, we need to figure
            // out how much the occurrence moved, and move the occurrence by
            // that amount.
            if (instance.parentItem.hasSameIds(instance)) {
                //XXX bad! Don't modify in-params!
                var startDiff = instance.startDate.subtractDate(aOccurrence.startDate);
                aNewStartTime.addDuration(startDiff);
                var endDiff = instance.endDate.subtractDate(aOccurrence.endDate);
                aNewEndTime.addDuration(endDiff);
            }

            instance.startDate = aNewStartTime;
            instance.endDate = aNewEndTime;

            doTransaction('modify', instance, instance.calendar, itemToEdit, null);
        } else {
            //XXX unify these
            if ("editEvent" in window) {
                // Sunbird specific code
                editEvent();
            } else {
                // Lightning specific code
                itemToEdit = getOccurrenceOrParent(aOccurrence);
                modifyEventWithDialog(itemToEdit);
            }
        }
    },

    deleteOccurrence: function (aOccurrence) {
        var itemToDelete = getOccurrenceOrParent(aOccurrence);
        if (!itemToDelete.parentItem.hasSameIds(itemToDelete)) {
            var event = itemToDelete.parentItem.clone();
            event.recurrenceInfo.removeOccurrenceAt(itemToDelete.recurrenceId);
            doTransaction('modify', event, event.calendar, itemToDelete.parentItem, null);
        } else {
            doTransaction('delete', itemToDelete, itemToDelete.calendar, null, null);
        }
    }
};

function switchToView(aViewType) {
    var viewDeck = getViewDeck();
    var selectedDay;
    try {
        var selectedDay = viewDeck.selectedPanel.selectedDay;
    } catch(ex) {
        // This dies if no view has even been chosen this session, but that's
        // ok because we'll just use now() below.
    } 

    if (!selectedDay)
        selectedDay = now();

    // Anyone wanting to plug in a view needs to follow this naming scheme
    var view = document.getElementById(aViewType+"-view");
    viewDeck.selectedPanel = view;

    var compositeCal = getCompositeCalendar();
    if (view.displayCalendar != compositeCal) {
        view.displayCalendar = compositeCal;
        view.timezone = calendarDefaultTimezone();
        view.controller = calendarViewController;
    }

    view.goToDay(selectedDay);
}

function moveView(aNumber) {
    getViewDeck().selectedPanel.moveView(aNumber);
}

// Helper function to get the view deck in a neutral way, regardless of whether
// we're in Sunbird or Lightning.
function getViewDeck() {
    var sbDeck = document.getElementById("view-deck");
    var ltnDeck = document.getElementById("calendar-view-box");
    return sbDeck || ltnDeck;
}

function currentView() {
    return getViewDeck().selectedPanel;
}

// Returns the actual style sheet object with the specified path.  Callers are
// responsible for any caching they may want to do.
function getStyleSheet(aStyleSheetPath) {
    for each (var sheet in document.styleSheets) {
        if (sheet.href == aStyleSheetPath) {
            return sheet;
        }
    }
}

// Updates the style rules for a particular object.  If the object is a
// category (and hence doesn't have a uri), we set the border color.  If
// it's a calendar, we set the background color
function updateStyleSheetForObject(aObject, aSheet) {
    var name;
    if (aObject.uri)
        name = aObject.uri.spec;
    else
        name = aObject.replace(' ','_');

    // Returns an equality selector for calendars (which have a uri), since an
    // event can only belong to one calendar.  For categories, however, returns
    // the ~= selector which matches anything in a space-separated list.
    function selectorForObject(name)
    {
        if (aObject.uri)
            return '.calendar-item[item-calendar="' + name + '"]';
        return '.calendar-item[item-category~="' + name + '"]';
    }
    
    function getRuleForObject(name)
    {
        for (var i = 0; i < aSheet.cssRules.length; i++) {
            var rule = aSheet.cssRules[i];
            if (rule.selectorText && (rule.selectorText == selectorForObject(name)))
                return rule;
        }
        return null;
    }
    
    var rule = getRuleForObject(name);
    if (!rule) {
        aSheet.insertRule(selectorForObject(name) + ' { }',
                                 aSheet.cssRules.length);
        rule = aSheet.cssRules[aSheet.cssRules.length-1];
    }

    var color;
    if (aObject.uri) {
        color = getCalendarManager().getCalendarPref(aObject, 'color');
        if (!color)
            color = "#A8C2E1";
        rule.style.backgroundColor = color;
        rule.style.color = getContrastingTextColor(color);
        return;
    }
    var categoryPrefBranch = prefService.getBranch("calendar.category.color.");
    try {
        color = categoryPrefBranch.getCharPref(aObject);
    }
    catch(ex) { return; }

    rule.style.border = color + " solid 2px";
}
