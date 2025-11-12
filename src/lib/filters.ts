/**
 * src/lib/filters.ts
 *
 * Generic biquad-cascade filter implementations driven by coefficient tables.
 * This file centralizes filter definitions (coefficients per sampling rate)
 * and provides a compact runtime `BiquadCascade` that executes an array of
 * second-order sections. New filters can be added by appending coefficient
 * entries to the `COEFFS` table without duplicating processing code.
 */

export type SectionCoeffs = {
    b0: number;
    b1: number;
    b2: number;
    a1: number; // note: uses a1/a2 as in the transposed DF2 form used below
    a2: number;
};

// Coefficient table: samplingRate -> filterKey -> sections[]
// Each filter maps to an array of sections (each section is a biquad's coeffs)
const COEFFS: Record<number, Record<string, SectionCoeffs[]>> = {
    500: {
        // Notch (50 Hz) - two biquad sections (ported from previous implementation)
        'notch-50': [
            { b0: 0.96508099, b1: -1.56202714, b2: 0.96508099, a1: -1.56858163, a2: 0.96424138 },
            { b0: 1.0, b1: -1.61854514, b2: 1.0, a1: -1.61100358, a2: 0.96592171 },
        ],
        // Notch (60 Hz)
        'notch-60': [
            { b0: 0.96508099, b1: -1.40747202, b2: 0.96508099, a1: -1.40810535, a2: 0.96443153 },
            { b0: 1.0, b1: -1.45839783, b2: 1.0, a1: -1.45687509, a2: 0.96573127 },
        ],

        // High-pass filters (0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10 Hz) - single biquad sections (order 2 implemented as 1 section here)
        'hp-0.01': [
            { b0: 0.99990838, b1: -1.99981676, b2: 0.99990838, a1: -1.99981669, a2: 0.99981683 },
        ],
        'hp-0.02': [
            { b0: 0.99981675, b1: -1.99963351, b2: 0.99981675, a1: -1.99963318, a2: 0.99963385 },
        ],
        'hp-0.05': [
            { b0: 0.99954186, b1: -1.99908372, b2: 0.99954186, a1: -1.99908205, a2: 0.99908539 },
        ],
        'hp-0.1': [
            { b0: 0.99908372, b1: -1.99816744, b2: 0.99908372, a1: -1.99816246, a2: 0.99817242 },
        ],
        'hp-0.2': [
            { b0: 0.99816745, b1: -1.99633491, b2: 0.99816745, a1: -1.99631790, a2: 0.99635192 },
        ],
        'hp-0.5': [
            { b0: 0.99556697, b1: -1.99113394, b2: 0.99556697, a1: -1.99111429, a2: 0.99115360 },
        ],
        'hp-1.0': [
            { b0: 0.99115360, b1: -1.98230719, b2: 0.99115360, a1: -1.98222893, a2: 0.98238545 },
        ],
        'hp-2.0': [
            { b0: 0.98238544, b1: -1.96477088, b2: 0.98238544, a1: -1.96446058, a2: 0.96508117 },
        ],
        'hp-5.0': [
            { b0: 0.95654323, b1: -1.91308645, b2: 0.95654323, a1: -1.91119707, a2: 0.91497583 },
        ],
        'hp-10.0': [
            { b0: 0.91497583, b1: -1.82995167, b2: 0.91497583, a1: -1.82660694, a2: 0.83329639 },
        ],
        'hp-70.0': [
            { b0: 0.74278713, b1: -1.48557426, b2: 0.74278713, a1: -1.34896775, a2: 0.51334715 },
        ],

        // Low-pass filters (10, 20, 30, 50, 70 Hz)
        'lp-10.0': [
            { b0: 0.00362168, b1: 0.00724336, b2: 0.00362168, a1: -1.82269493, a2: 0.83718165 },
        ],
        'lp-20.0': [
            { b0: 0.01335920, b1: 0.02671840, b2: 0.01335920, a1: -1.64745998, a2: 0.70089678 },
        ],
        'lp-30.0': [
            { b0: 0.02785977, b1: 0.05571953, b2: 0.02785977, a1: -1.47548044, a2: 0.58691951 },
        ],
        'lp-50.0': [
            { b0: 0.06646074, b1: 0.13292149, b2: 0.06646074, a1: -1.14298050, a2: 0.41280160 },
        ],
        'lp-70.0': [
            { b0: 0.10926967, b1: 0.21853934, b2: 0.10926967, a1: -0.78734302, a2: 0.28518928 },
        ],
    },
    
};

/**
 * Lightweight biquad-cascade (array of 2nd-order sections) implementation.
 * The implementation follows the structure used in the previous Notch class:
 * x = input - (a1 * z1) - (a2 * z2)
 * output = b0 * x + b1 * z1 + b2 * z2
 * z2 = z1; z1 = x;
 */
export class BiquadCascade {
    private sections: SectionCoeffs[] = [];
    private z1: number[] = [];
    private z2: number[] = [];

    constructor(sections?: SectionCoeffs[]) {
        if (sections) this.setCoeffs(sections);
    }

    setCoeffs(sections: SectionCoeffs[]) {
        this.sections = sections.map(s => ({ ...s }));
        this.z1 = new Array(this.sections.length).fill(0);
        this.z2 = new Array(this.sections.length).fill(0);
    }

    reset() {
        for (let i = 0; i < this.sections.length; i++) {
            this.z1[i] = 0;
            this.z2[i] = 0;
        }
    }

    process(inputSample: number): number {
        let output = inputSample;
        for (let i = 0; i < this.sections.length; i++) {
            const s = this.sections[i];
            const x = output - (s.a1 * this.z1[i]) - (s.a2 * this.z2[i]);
            output = (s.b0 * x) + (s.b1 * this.z1[i]) + (s.b2 * this.z2[i]);
            this.z2[i] = this.z1[i];
            this.z1[i] = x;
        }
        return output;
    }
}

/**
 * Factory: create a BiquadCascade for a named filter at a given sampling rate.
 * Returns null if no coefficient entry exists for the requested filter/rate.
 */
export function createFilterInstance(filterKey: string, samplingRate: number): BiquadCascade | null {
    const byRate = COEFFS[samplingRate];
    if (!byRate) return null;
    const sects = byRate[filterKey];
    if (!sects) return null;
    return new BiquadCascade(sects);
}

/**
 * Backwards-compatible Notch class with the same public API used elsewhere:
 * - setbits(samplingRate: number)
 * - process(input:number, type:number)
 *
 * Internally uses the coefficient table and BiquadCascade.
 */
export class Notch {
    private z1_1: number;
    private z2_1: number;
    private z1_2: number;
    private z2_2: number;
    private x_1: number;
    private x_2: number;
    private currentSamplingRate: number;

    constructor() {
        this.z1_1 = 0;
        this.z2_1 = 0;
        this.z1_2 = 0;
        this.z2_2 = 0;
        this.x_1 = 0;
        this.x_2 = 0;
        this.currentSamplingRate = 0;
    }

    setbits(currentSamplingRate: number): void {
        this.currentSamplingRate = currentSamplingRate;
        // reset state when sampling rate changes to avoid artifacts
        this.z1_1 = this.z2_1 = this.z1_2 = this.z2_2 = 0;
        this.x_1 = this.x_2 = 0;
    }

    process(input: number, type: number): number {
        if (!type) return input;
        let output = input;

        switch (this.currentSamplingRate) {
            case 500:
                switch (type) {
                    case 1:
                        // Notch @ ~50Hz, sampling 500Hz - section 1
                        this.x_1 = output - (-1.56858163 * this.z1_1) - (0.96424138 * this.z2_1);
                        output = 0.96508099 * this.x_1 + -1.56202714 * this.z1_1 + 0.96508099 * this.z2_1;
                        this.z2_1 = this.z1_1;
                        this.z1_1 = this.x_1;
                        // section 2
                        this.x_2 = output - (-1.61100358 * this.z1_2) - (0.96592171 * this.z2_2);
                        output = 1.0 * this.x_2 + -1.61854514 * this.z1_2 + 1.0 * this.z2_2;
                        this.z2_2 = this.z1_2;
                        this.z1_2 = this.x_2;
                        break;

                    case 2:
                        // Notch @ ~60Hz, sampling 500Hz - section 1
                        this.x_1 = output - (-1.40810535 * this.z1_1) - (0.96443153 * this.z2_1);
                        output = 0.96508099 * this.x_1 + -1.40747202 * this.z1_1 + 0.96508099 * this.z2_1;
                        this.z2_1 = this.z1_1;
                        this.z1_1 = this.x_1;
                        // section 2
                        this.x_2 = output - (-1.45687509 * this.z1_2) - (0.96573127 * this.z2_2);
                        output = 1.0 * this.x_2 + -1.45839783 * this.z1_2 + 1.0 * this.z2_2;
                        this.z2_2 = this.z1_2;
                        this.z1_2 = this.x_2;
                        break;

                    default:
                        break;
                }
                break;

            default:
                // no matching sampling rate — bypass filter
                break;
        }

        return output;
    }
}

export default { BiquadCascade, createFilterInstance, Notch };
