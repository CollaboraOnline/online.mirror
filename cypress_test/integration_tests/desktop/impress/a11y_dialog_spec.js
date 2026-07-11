/* global describe expect it cy before after afterEach require Cypress */

var helper = require('../../common/helper');
var desktopHelper = require('../../common/desktop_helper');
var impressHelper = require('../../common/impress_helper');
var a11yHelper = require('../../common/a11y_helper');

const allImpressDialogs = [
    '.uno:HeaderAndFooter',
    '.uno:InsertTable',
    '.uno:PageSetup',
    '.uno:TableDialog',
];

// 'common' dialogs that impress specifically does not support
const excludedCommonDialogs = [
    '.uno:AcceptTrackedChanges',
    '.uno:SpellingAndGrammarDialog', // does not open in impress, SpellDialog is the equivalent
    '.uno:StyleNewByExample', // command dispatches but does not surface a dialog in impress
];

describe(['tagdesktop'], 'Accessibility Impress Dialog Tests', { testIsolation: false }, function () {
    let win;
    let hasLinguisticData = false;

    before(function () {
        helper.setupAndLoadDocument('impress/help_dialog.odp', /*isMultiUser=*/false, /*copyCertificates=*/true);

        // to make insertImage use the correct buttons
        desktopHelper.switchUIToNotebookbar();

        helper.setDummyClipboardForCopy();

        cy.getFrameWindow().then(function (frameWindow) {
            win = frameWindow;
            a11yHelper.enableUICoverage(win);
        });

        cy.cGet('.jsdialog-window').should('not.exist');

        cy.then(() => {
            return helper.processToIdle(win);
        }).then(() => {
            // help_dialog.odp has a table on slide 1. Click into it so the
            // default context is a text insertion point - lots of common
            // dialogs (InsertSymbol, ThesaurusDialog etc.) only work that way.
            impressHelper.selectTableInTheCenter(win);
        });

        cy.then(() => {
            const thesaurusState = win.app.map.stateChangeHandler.getItemValue('.uno:ThesaurusDialog');
            hasLinguisticData = (thesaurusState === 'enabled');
        });
    });

    after(function () {
        a11yHelper.reportUICoverage(win, hasLinguisticData);

        cy.get('@uicoverageResult').then(result => {
            expect(result.used, `used .ui files`).to.not.be.empty;
            expect(result.CompleteImpressDialogCoverage,
                `complete impress dialog coverage; missing: ${JSON.stringify(result.MissingImpressDialogCoverage)}`).to.be.true;
            expect(result.CompleteCommonDialogCoverage,
                `complete common dialog coverage; missing: ${JSON.stringify(result.MissingCommonDialogCoverage)}`).to.be.true;
        });
    });

    afterEach(function () {
        // Close any dialogs that might still be open after a test failure
        cy.cGet('body').then($body => {
            const dialogs = $body.find('.jsdialog-window .ui-dialog-titlebar-close');
            if (dialogs.length > 0) {
                // Close dialogs from innermost to outermost
                for (let i = dialogs.length - 1; i >= 0; i--) {
                    cy.wrap(dialogs[i]).click({ force: true });
                }
            }
        });
        cy.cGet('.jsdialog-window:not(.ui-overflow-group-popup):not(.snackbar)').should('not.exist');

        a11yHelper.resetState();

        // drop any lingering text-edit or shape selection so the click
        // sequence in selectTableInTheCenter starts from slide level.
        helper.typeIntoDocument('{esc}{esc}');

        // re-establish the cursor in the first table cell after a test that
        // moved focus elsewhere (selecting a shape, escaping etc.)
        impressHelper.selectTableInTheCenter(win);
    });

    // Helper to test that a11y validation detects injected errors
    function testA11yErrorDetection(injectBadElement) {
        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:FontDialog');
        });

        a11yHelper.getActiveDialog(1)
            .then(() => helper.processToIdle(win))
            .then(() => {
                a11yHelper.getActiveDialog(1).then($dialog => {
                    injectBadElement($dialog, win);
                });
            })
            .then(() => {
                // Validation should detect an error
                var spy = Cypress.sinon.spy(win.console, 'error');
                win.app.dispatcher.dispatch('validatedialogsa11y');

                cy.then(() => {
                    const a11yErrors = spy.getCalls().filter(call =>
                        String(call.args[0]).includes(win.app.A11yValidatorException.PREFIX)
                    );
                    expect(a11yErrors.length, 'Should detect a11y error').to.be.greaterThan(0);
                    spy.restore();
                });
            })
            .then(() => {
                a11yHelper.closeActiveDialog(1);
            });
    }

    it('Detects non-native button element error', function () {
        testA11yErrorDetection(function($dialog, win) {
            // Inject a span with role="button" instead of native <button>
            const badElement = win.document.createElement('span');
            badElement.setAttribute('role', 'button');
            badElement.setAttribute('id', 'something');
            badElement.textContent = 'Bad Button';
            $dialog.find('.ui-dialog-content')[0].appendChild(badElement);
        });
    });

    it('Detects image missing alt attribute', function () {
        testA11yErrorDetection(function($dialog, win) {
            // Inject an image without alt attribute
            const container = win.document.createElement('div');
            container.setAttribute('id', 'something');
            const img = win.document.createElement('img');
            img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            // No alt attribute set
            container.appendChild(img);
            $dialog.find('.ui-dialog-content')[0].appendChild(container);
        });
    });

    it('Detects image with empty alt but parent lacks label', function () {
        testA11yErrorDetection(function($dialog, win) {
            // Inject an image with empty alt="" but parent has no label
            const container = win.document.createElement('div');
            container.setAttribute('id', 'something');
            container.id = 'test-unlabeled-parent';
            // No aria-label, aria-labelledby, or associated label element
            const img = win.document.createElement('img');
            img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            img.setAttribute('alt', '');
            container.appendChild(img);
            $dialog.find('.ui-dialog-content')[0].appendChild(container);
        });
    });

    it('Detects image with non-empty alt when parent also has label', function () {
        testA11yErrorDetection(function($dialog, win) {
            // Inject an image with non-empty alt AND parent has aria-label (duplicate)
            const container = win.document.createElement('div');
            container.setAttribute('id', 'something');
            container.setAttribute('aria-label', 'Parent Label');
            const img = win.document.createElement('img');
            img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            img.setAttribute('alt', 'Image description');
            container.appendChild(img);
            $dialog.find('.ui-dialog-content')[0].appendChild(container);
        });
    });

    a11yHelper.allCommonDialogs.forEach(function (commandSpec) {
        const command = typeof commandSpec === 'string' ? commandSpec : commandSpec.command;
        if (excludedCommonDialogs.includes(command)) {
            // silently skip the common dialogs that writer doesn't have
            return;
        } else {
            it(`Common Dialog ${command}`, function () {
                if (!hasLinguisticData && a11yHelper.needsLinguisticData(command)) {
                    this._runnable.title += ' (skipped: missing linguistic data)';
                    this.skip();
                }
                a11yHelper.testDialog(win, commandSpec);
            });
        }
    });

    it('Transform dialog', function () {
        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:BasicShapes.octagon');
        });

        cy.cGet('#test-div-shapeHandlesSection').should('exist');

        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:TransformDialog');
        });
        a11yHelper.handleDialog(win, 1, '.uno:TransformDialog');

        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:FormatArea');
        });
        a11yHelper.handleDialog(win, 1, '.uno:FormatArea');

        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:FormatLine');
        });
        a11yHelper.handleDialog(win, 1, '.uno:FormatLine');

        // exit shape mode
        helper.typeIntoDocument('{esc}');
    });

    it('PasteSpecial Dialog', function () {
        // Select some text
        helper.selectAllText();

        helper.copy().then(() => {
            return helper.processToIdle(win);
        })
        .then(() => {
            win.app.map.sendUnoCommand('.uno:PasteSpecial');
        });
        a11yHelper.handleDialog(win, 1);
    });

    it('PDF export warning dialog', function () {
        a11yHelper.testPDFExportWarningDialog(win);
    });

    // TODO - create allImpressDialogs
    allImpressDialogs.forEach(function (commandSpec) {
        const command = typeof commandSpec === 'string' ? commandSpec : commandSpec.command;
        it(`Impress Dialog ${command}`, function () {
            a11yHelper.testDialog(win, commandSpec);
        });
    });

    it('Graphic dialog', function () {
        helper.typeIntoDocument('{esc}{esc}');
        helper.processToIdle(win);
        desktopHelper.insertImage();
        cy.cGet('#test-div-shapeHandlesSection').should('exist');
        helper.processToIdle(win);
        a11yHelper.testDialog(win, '.uno:CompressGraphic');
        // remove the inserted image so subsequent tests can reach the table
        helper.typeIntoDocument('{del}');
    });

    it('Hatch Add name dialog and duplicate warning', function () {
        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:BasicShapes.octagon');
        });
        cy.cGet('#test-div-shapeHandlesSection').should('exist');

        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:FormatArea');
        });

        a11yHelper.getActiveDialog(1)
            .then(() => helper.processToIdle(win))
            .then(() => {
                cy.cGet('.ui-dialog [role="tab"]').then($tabs => {
                    let areaTab = null;
                    let hatchTab = null;
                    $tabs.each((_i, el) => {
                        const controls = el.getAttribute('aria-controls') || '';
                        const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
                        if (controls === 'RID_SVXPAGE_AREA' || (!areaTab && label === 'Area' && controls !== 'lbhatch'))
                            areaTab = el;
                        if (controls === 'lbhatch')
                            hatchTab = el;
                    });
                    expect(areaTab, 'outer Area tab').to.not.be.null;
                    expect(hatchTab, 'inner Hatch tab').to.not.be.null;
                    areaTab.click();
                    hatchTab.click();
                });
                return helper.processToIdle(win);
            })
            .then(() => {
                cy.cGet('button.ui-pushbutton[aria-label="Add"]:visible').click();
                return helper.processToIdle(win);
            });

        a11yHelper.testNameDialog(win, 1);

        a11yHelper.closeActiveDialog(1);
        helper.typeIntoDocument('{esc}');
    });

    it('Paragraph dialog', function () {
        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:ParagraphDialog');
        });
        a11yHelper.handleDialog(win, 1, '.uno:ParagraphDialog');
    });

    it('Bullets and Numbering dialog', function () {
        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:OutlineBullet');
        });
        a11yHelper.handleDialog(win, 1, '.uno:OutlineBullet');
    });

    it('Font dialog', function () {
        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:FontDialog');
        });
        a11yHelper.handleDialog(win, 1, '.uno:FontDialog');
    });

    it('Object dialog', function () {
        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:BasicShapes.octagon');
        });
        cy.cGet('#test-div-shapeHandlesSection').should('exist');

        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:NameGroup');
        });
        a11yHelper.handleDialog(win, 1, '.uno:NameGroup');

        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:ObjectTitleDescription');
        });
        a11yHelper.handleDialog(win, 1, '.uno:ObjectTitleDescription');

        helper.typeIntoDocument('{esc}');
    });

    it('Interaction dialog', function () {
        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:BasicShapes.octagon');
        });
        cy.cGet('#test-div-shapeHandlesSection').should('exist');

        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:AnimationEffects');
        });
        a11yHelper.handleDialog(win, 1, '.uno:AnimationEffects');

        helper.typeIntoDocument('{esc}');
    });

    it('Custom Animation dialog', function () {
        // afterEach left us inside a table cell on slide 1. Escape out so
        // BasicShapes.octagon adds a shape at slide level rather than
        // inside the table.
        helper.typeIntoDocument('{esc}{esc}{esc}');

        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:BasicShapes.octagon');
        });
        cy.cGet('#test-div-shapeHandlesSection').should('exist');
        cy.then(() => helper.processToIdle(win));

        // Enter the shape and add some text so the dialog adds its
        // text-animation tab (customanimationtexttab.ui), then escape back
        // to shape selection so Add Effect remains applicable.
        helper.typeIntoDocument('{enter}');
        helper.typeIntoDocument('text');
        helper.typeIntoDocument('{esc}');
        cy.cGet('#test-div-shapeHandlesSection').should('exist');
        cy.then(() => helper.processToIdle(win));

        // Open the Custom Animation sidebar deck. .uno:CustomAnimation
        // is the SidebarController binding for SdCustomAnimationDeck.
        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:CustomAnimation');
        });
        cy.cGet('#sidebar-dock-wrapper').should('be.visible');
        cy.cGet('#add_effect').should('be.visible');
        cy.then(() => helper.processToIdle(win));

        function clickSidebarPushButton(id) {
            cy.cGet('#' + id).scrollIntoView().should('be.visible');
            cy.cGet('#' + id + ' button').should('not.be.disabled').click();
        }

        clickSidebarPushButton('add_effect');
        cy.then(() => helper.processToIdle(win));

        clickSidebarPushButton('more_properties');
        a11yHelper.handleDialog(win, 1, '.uno:CustomAnimationDialog');

        // restore the default impress sidebar deck and drop the shape selection
        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:ModifyPage');
        });
        helper.typeIntoDocument('{esc}');
    });

    it('Minimize Presentation wizard', function () {
        cy.then(() => {
            win.app.map.sendUnoCommand('.uno:PresentationMinimizer');
        });

        // walk every page: Introduction, Slides, Images, Objects, Summary
        a11yHelper.getActiveDialog(1)
            .then(() => helper.processToIdle(win))
            .then(() => a11yHelper.runA11yValidation(win, 'validatedialogsa11y'));

        // the introduction warns that the presentation itself is changed
        cy.cGet('#STR_INTRODUCTION_T').should('contain.text', 'different file first');

        // applying waits for the last page
        cy.cGet('#finish button').should('be.disabled');

        function goToNextPage() {
            cy.cGet('#next button').should('not.be.disabled').click();
            cy.then(() => helper.processToIdle(win))
                .then(() => a11yHelper.runA11yValidation(win, 'validatedialogsa11y'));
        }

        goToNextPage(); // Slides
        cy.cGet('#finish button').should('be.disabled');

        goToNextPage(); // Images
        // the page carries a heading over each group of settings
        cy.cGet('#STR_RECOMPRESS_IMAGES').should('contain.text', 'Re-compress images');
        cy.cGet('#STR_IMAGE_RESOLUTION').should('contain.text', 'Reduce image resolution');

        // every image resolution is offered on the page itself, and the images
        // are kept as they are until another one is picked
        cy.cGet('#LB_RESOLUTION').should('not.exist');
        cy.cGet('#RB_RESOLUTION_0 input').should('be.checked');
        cy.cGet('#RB_RESOLUTION_96 input').should('not.be.checked');
        cy.cGet('#RB_RESOLUTION_600').should('be.visible');

        goToNextPage(); // Objects
        // The page is offered whether or not the presentation has OLE
        // objects. This one has none, so it says so where the choice would
        // have been and there is nothing to switch on.
        cy.cGet('#STR_OLE_REPLACE').should('be.visible');
        cy.cGet('#STR_OLE_REPLACE input').should('be.disabled');
        cy.cGet('#STR_NO_OLE_OBJECTS').should('be.visible')
            .should('contain.text', 'contains no OLE objects');
        cy.cGet('#STR_ALL_OLE_OBJECTS input').should('be.disabled');
        cy.cGet('#STR_OLE_OBJECTS_DESC')
            .should('contain.text', 'Object Linking and Embedding')
            .should('not.contain.text', 'no OLE objects');

        goToNextPage(); // Summary

        // the summary page lists a checkbox per change to apply. This
        // small document produces no listed changes, and neither the
        // saved-settings handling nor the where-to-apply choice exist.
        cy.cGet('#STR_SUMMARY_TITLE').should('contain.text', 'Select which changes to apply');
        cy.cGet('#CHECK1').should('not.be.visible');
        cy.cGet('#STR_SAVE_SETTINGS').should('not.exist');
        cy.cGet('#MY_SETTINGS').should('not.exist');
        cy.cGet('#STR_APPLY_TO_CURRENT').should('not.exist');
        cy.cGet('#STR_SAVE_AS').should('not.exist');

        // the progress bar joins the page once the optimization runs
        cy.cGet('#PROGRESS').should('not.be.visible');

        // the apply button ends the row of buttons
        cy.cGet('#finish button').should('contain.text', 'Apply');
        cy.cGet('.jsdialog-window .ui-button-box-right > :last-child')
            .should('have.id', 'finish');

        cy.cGet('#finish button').should('not.be.disabled').click();

        // the wizard applies without asking about unsaved changes and the
        // result summary names the document
        a11yHelper.getActiveDialog(1)
            .then(() => helper.processToIdle(win))
            .then(() => a11yHelper.runA11yValidation(win, 'validatedialogsa11y'));
        cy.cGet('.jsdialog-window')
            .should('contain.text', 'Successfully updated the presentation')
            .should('contain.text', '.odp')
            .should('not.contain.text', '%TITLE');
        a11yHelper.closeActiveDialog(1);
    });


});
