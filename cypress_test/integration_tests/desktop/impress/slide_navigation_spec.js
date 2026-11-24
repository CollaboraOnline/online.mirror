/* -*- js-indent-level: 8 -*- */
/* global describe it cy require beforeEach expect Cypress */

var helper = require('../../common/helper');

describe(['tagdesktop', 'tagnextcloud', 'tagproxy'], 'Slide Navigation', function() {

    beforeEach(function() {
        helper.setupAndLoadDocument('impress/slide_navigation.odp', false, false, undefined, 'vector=false');
        cy.getFrameWindow().then(function(win) {
            this.win = win;
        }.bind(this));
    });

    // Holds back the setpart messages that confirm a slide switch, as a slow connection would,
    // so the confirmations arrive only after the user has moved on to another slide.
    function holdSlideConfirmations(win) {
        var docLayer = win.app.map._docLayer;
        var onSetPartMsg = docLayer._onSetPartMsg;
        win.heldConfirmations = [];
        docLayer._onSetPartMsg = function() {
            if (win.heldConfirmations)
                win.heldConfirmations.push(arguments);
            else
                onSetPartMsg.apply(this, arguments);
            if (win.recordCurrentSlide)
                win.recordCurrentSlide();
        };
    }

    // Delivers the held confirmations in the order they came, and records in win.slidesShown
    // each slide the sorter marks as the current one from then on. The check runs after each
    // confirmation, and at the end of each script run that changes the sorter, because all the
    // held messages are handled in one run.
    function releaseSlideConfirmations(win) {
        var docLayer = win.app.map._docLayer;
        var preview = docLayer._preview;
        win.slidesShown = [];
        win.recordCurrentSlide = function() {
            for (var i = 0; i < preview._previewTiles.length; i++) {
                if (!preview._previewTiles[i].classList.contains('preview-img-currentpart'))
                    continue;
                var shown = win.slidesShown;
                if (shown[shown.length - 1] !== i)
                    shown.push(i);
                return;
            }
        };
        new win.MutationObserver(win.recordCurrentSlide).observe(
            win.document.getElementById('slide-sorter'),
            { attributes: true, attributeFilter: ['class'], subtree: true });
        win.recordCurrentSlide();
        var held = win.heldConfirmations;
        win.heldConfirmations = null;
        for (var i = 0; i < held.length; i++)
            docLayer._onSetPartMsg(held[i][0]);
    }

    // Presses the key on the slide that has the focus, and waits until the server has handled
    // the switch, so the server sends a confirmation for each key.
    function pressKeyOnSlide(win, key, fromSlide, toSlide) {
        cy.cGet('#preview-img-part-' + fromSlide).type(key);
        helper.assertFocus('id', 'preview-img-part-' + toSlide);
        helper.processToIdle(win);
    }

    it('Arrow navigation', function() {
        cy.cGet('#preview-img-part-0').click();

        cy.cGet('#preview-img-part-0').type('{downarrow}');
        helper.assertFocus('id', 'preview-img-part-1');

        cy.cGet('#preview-img-part-1').type('{downarrow}');
        helper.assertFocus('id', 'preview-img-part-2');
        cy.cGet('#preview-img-part-2').should('have.class', 'preview-img-currentpart');

        cy.cGet('#preview-img-part-2').type('{uparrow}');
        helper.assertFocus('id', 'preview-img-part-1');

        cy.cGet('#preview-img-part-1').type('{uparrow}');
        helper.assertFocus('id', 'preview-img-part-0');
        cy.cGet('#preview-img-part-0').should('have.class', 'preview-img-currentpart');
    });

    // Waits until the layouting queue has run every task it holds, checking once per frame.
    function waitForLayoutingFrame(win) {
        return new Cypress.Promise(function(resolve) {
            function check() {
                if (win.app.layoutingService.hasTasksPending())
                    win.requestAnimationFrame(check);
                else
                    resolve();
            }
            win.requestAnimationFrame(check);
        });
    }

    // Presses Down on the focused slide the given number of times, one press per frame or two,
    // as a held key repeats. After each press the sorter gets to finish the layout work that
    // the press queued, and the slide that has the focus is recorded in win.focusedSlides with
    // whether the sorter shows it whole.
    function holdDownOnSlides(win, presses) {
        var sorter = win.document.getElementById('slide-sorter');
        win.focusedSlides = [];
        var pressed = 0;
        function pressOnce() {
            if (pressed === presses)
                return Cypress.Promise.resolve();
            pressed++;
            win.document.activeElement.dispatchEvent(
                new win.KeyboardEvent('keydown',
                    { key: 'ArrowDown', keyCode: 40, which: 40, bubbles: true }));
            return waitForLayoutingFrame(win).then(function() {
                var focused = win.document.activeElement;
                var slideRect = focused.getBoundingClientRect();
                var sorterRect = sorter.getBoundingClientRect();
                win.focusedSlides.push({
                    id: focused.id,
                    inView: slideRect.top >= sorterRect.top - 1 &&
                        slideRect.bottom <= sorterRect.bottom + 1
                });
                return pressOnce();
            });
        }
        return pressOnce();
    }

    it('Holding Down keeps the focused slide in view', function() {
        cy.cGet('#preview-img-part-0').click();
        helper.processToIdle(this.win);
        helper.assertFocus('id', 'preview-img-part-0');

        // The last slide starts out below the visible part of the sorter, so the sorter has to
        // scroll for the focus to reach it.
        cy.getFrameWindow().should(function(win) {
            var sorter = win.document.getElementById('slide-sorter');
            var last = win.document.getElementById('preview-img-part-13');
            expect(last.getBoundingClientRect().top)
                .to.be.greaterThan(sorter.getBoundingClientRect().bottom);
        });

        cy.getFrameWindow().then(function(win) {
            return holdDownOnSlides(win, 13);
        });

        // Each press moved the focus on by one slide, and the sorter showed that slide whole
        // before the next press came.
        cy.getFrameWindow().then(function(win) {
            var expectedIds = [];
            for (var i = 1; i <= 13; i++)
                expectedIds.push('preview-img-part-' + i);
            var focusedIds = win.focusedSlides.map(function(slide) { return slide.id; });
            var hiddenIds = win.focusedSlides
                .filter(function(slide) { return !slide.inView; })
                .map(function(slide) { return slide.id; });
            expect(focusedIds).to.deep.equal(expectedIds);
            expect(hiddenIds, 'focused slides out of view').to.deep.equal([]);
        });

        helper.processToIdle(this.win);
        helper.assertFocus('id', 'preview-img-part-13');
        cy.cGet('#preview-img-part-13').should('have.class', 'preview-img-currentpart');
    });

    it('Arrow navigation on a slow connection stays on the last slide reached', function() {
        cy.cGet('#preview-img-part-0').click();
        helper.processToIdle(this.win);
        helper.assertFocus('id', 'preview-img-part-0');

        cy.getFrameWindow().then(function(win) {
            holdSlideConfirmations(win);
        });
        pressKeyOnSlide(this.win, '{downarrow}', 0, 1);
        pressKeyOnSlide(this.win, '{downarrow}', 1, 2);
        pressKeyOnSlide(this.win, '{downarrow}', 2, 3);
        cy.getFrameWindow().its('heldConfirmations').should('have.length', 3);

        cy.getFrameWindow().then(function(win) {
            releaseSlideConfirmations(win);
        });
        helper.processToIdle(this.win);

        cy.cGet('#preview-img-part-3').should('have.class', 'preview-img-currentpart');
        // The late confirmations of slides 1 and 2 do not show those slides again.
        cy.getFrameWindow().its('slidesShown').should('deep.equal', [3]);
    });

    it('Arrow navigation back and forth on a slow connection stays on the last slide reached',
        function() {
        cy.cGet('#preview-img-part-0').click();
        helper.processToIdle(this.win);
        helper.assertFocus('id', 'preview-img-part-0');

        cy.getFrameWindow().then(function(win) {
            holdSlideConfirmations(win);
        });
        // Slide 1 is picked twice before the server confirms either pick.
        pressKeyOnSlide(this.win, '{downarrow}', 0, 1);
        pressKeyOnSlide(this.win, '{uparrow}', 1, 0);
        pressKeyOnSlide(this.win, '{downarrow}', 0, 1);
        cy.getFrameWindow().its('heldConfirmations').should('have.length', 3);

        cy.getFrameWindow().then(function(win) {
            releaseSlideConfirmations(win);
        });
        helper.processToIdle(this.win);

        cy.cGet('#preview-img-part-1').should('have.class', 'preview-img-currentpart');
        // The late confirmation of slide 0 does not show that slide again.
        cy.getFrameWindow().its('slidesShown').should('deep.equal', [1]);
    });
});
