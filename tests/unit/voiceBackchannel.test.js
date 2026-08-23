const {
    classifyInterruption,
    tokenize,
} = require('../../utils/voiceBackchannel');

describe('voiceBackchannel.tokenize', () => {
    it('strips the punctuation Deepgram smart_format adds', () => {
        expect(tokenize('Uh-huh.')).toEqual(['uhhuh']);
        expect(tokenize("I've got it!")).toEqual(['ive', 'got', 'it']);
    });

    it('returns an empty list for blank and nullish input', () => {
        expect(tokenize('')).toEqual([]);
        expect(tokenize('   ')).toEqual([]);
        expect(tokenize(null)).toEqual([]);
        expect(tokenize(undefined)).toEqual([]);
    });
});

describe('classifyInterruption — backchannels keep the tutor talking', () => {
    // These are the utterances that used to cost a student the rest of an
    // explanation: any STT partial over two characters killed the turn.
    const nods = [
        'mhm', 'mm-hmm', 'uh-huh', 'yeah', 'yep', 'okay', 'ok', 'right',
        'sure', 'got it', 'I see', 'makes sense', 'alright', 'cool',
        'yeah okay', 'mhm yeah',
    ];

    it.each(nods)('treats %p as a backchannel', (utterance) => {
        expect(classifyInterruption(utterance).isBackchannel).toBe(true);
    });

    it('holds the turn when the transcript is empty (breath, room noise)', () => {
        expect(classifyInterruption('').isBackchannel).toBe(true);
        expect(classifyInterruption('  ').isBackchannel).toBe(true);
        expect(classifyInterruption('...').isBackchannel).toBe(true);
    });
});

describe('classifyInterruption — real interruptions stop the tutor', () => {
    const interrupts = [
        'wait',
        'stop',
        'hold on',
        'no',
        'what',
        'why does that work',
        'can you say that again',
        'I do not get it',
        'so is x equal to four',
        'slower please',
    ];

    it.each(interrupts)('treats %p as an interruption', (utterance) => {
        expect(classifyInterruption(utterance).isBackchannel).toBe(false);
    });

    it('lets a hard-interrupt word override surrounding acknowledgements', () => {
        // "okay wait" is a student catching themselves, not agreeing.
        expect(classifyInterruption('okay wait').isBackchannel).toBe(false);
        expect(classifyInterruption('yeah no').isBackchannel).toBe(false);
    });

    it('treats one content word among nods as a real interruption', () => {
        expect(classifyInterruption('yeah but negative').isBackchannel).toBe(false);
    });

    it('classifies anything sentence-length as an interruption', () => {
        // A question can wear a backchannel's clothes at the front.
        const verdict = classifyInterruption('yeah okay sure that is fine');
        expect(verdict.isBackchannel).toBe(false);
        expect(verdict.reason).toBe('utterance_too_long');
    });
});
