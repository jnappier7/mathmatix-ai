// public/js/age-tier-standalone.js
// Lightweight, non-module version of age-tier for pages that don't use ES modules
// (e.g., student-dashboard.html). The full ES module version lives in modules/age-tier.js.
//
// Exposes: window.applyAgeTierFromGrade(gradeLevel)

(function () {
    'use strict';

    var GRADE_TO_TIER = {
        'kindergarten': 'k2', 'k': 'k2',
        '1st grade': 'k2', '1st': 'k2',
        '2nd grade': 'k2', '2nd': 'k2',

        '3rd grade': '35', '3rd': '35',
        '4th grade': '35', '4th': '35',
        '5th grade': '35', '5th': '35',

        '6th grade': '68', '6th': '68',
        '7th grade': '68', '7th': '68',
        '8th grade': '68', '8th': '68',

        '9th grade': '9plus', '9th': '9plus',
        '10th grade': '9plus', '10th': '9plus',
        '11th grade': '9plus', '11th': '9plus',
        '12th grade': '9plus', '12th': '9plus',
        'college': '9plus', 'university': '9plus'
    };

    var TIER_CLASSES = ['age-tier-k2', 'age-tier-35', 'age-tier-68', 'age-tier-9plus'];

    window.applyAgeTierFromGrade = function (gradeLevel) {
        var tier = '9plus';
        if (gradeLevel) {
            tier = GRADE_TO_TIER[gradeLevel.trim().toLowerCase()] || '9plus';
        }
        var tierClass = 'age-tier-' + tier;

        for (var i = 0; i < TIER_CLASSES.length; i++) {
            document.body.classList.remove(TIER_CLASSES[i]);
        }
        document.body.classList.add(tierClass);
        console.log('[AgeTier] Applied tier "' + tier + '" (grade: ' + (gradeLevel || 'unknown') + ')');
    };
})();
