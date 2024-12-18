/**
 * DISCLAIMER:
 *
 * All the functions inside this file were copied (and slightly modified) on the 2024-12-18 from: https://github.com/woltapp/blurhash
 *
 * Permalinks to the specific file versions:
 *   - https://github.com/woltapp/blurhash/blob/712a47f946b98c30097eb1ada086ea00b18681ec/TypeScript/src/base83.ts
 *   - https://github.com/woltapp/blurhash/blob/712a47f946b98c30097eb1ada086ea00b18681ec/TypeScript/src/decode.ts
 *   - https://github.com/woltapp/blurhash/blob/712a47f946b98c30097eb1ada086ea00b18681ec/TypeScript/src/encode.ts
 *   - https://github.com/woltapp/blurhash/blob/712a47f946b98c30097eb1ada086ea00b18681ec/TypeScript/src/error.ts
 *   - https://github.com/woltapp/blurhash/blob/712a47f946b98c30097eb1ada086ea00b18681ec/TypeScript/src/utils.ts
 *
 * Modifications to the original code include:
 *   - Whitespace auto formatting
 *   - Remove file imports/exports, since everything is included here
 *   - Typescript type coercion for `punch` inside `decode`
 *   - Added comment for `digitCharacters`
 *   - Typecheck and return string inside `isBlurhashValid` in case its not an instance of `Error`
 *
 * Now follows the original license and copyright notice at time of copying
 *
 * ========================================================================================================================================
 *
 * MIT License
 *
 * Copyright (c) 2018 Wolt Enterprises
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 */

/** Valid base83 characters */
const digitCharacters = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  "#",
  "$",
  "%",
  "*",
  "+",
  ",",
  "-",
  ".",
  ":",
  ";",
  "=",
  "?",
  "@",
  "[",
  "]",
  "^",
  "_",
  "{",
  "|",
  "}",
  "~",
];

const decode83 = (str: String) => {
  let value = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const digit = digitCharacters.indexOf(c);
    value = value * 83 + digit;
  }
  return value;
};

const encode83 = (n: number, length: number): string => {
  var result = "";
  for (let i = 1; i <= length; i++) {
    let digit = (Math.floor(n) / Math.pow(83, length - i)) % 83;
    result += digitCharacters[Math.floor(digit)];
  }
  return result;
};

/**
 * Returns an error message if invalid or undefined if valid
 * @param blurhash
 */
const validateBlurhash = (blurhash: string) => {
  if (!blurhash || blurhash.length < 6) {
    throw new ValidationError("The blurhash string must be at least 6 characters");
  }

  const sizeFlag = decode83(blurhash[0]);
  const numY = Math.floor(sizeFlag / 9) + 1;
  const numX = (sizeFlag % 9) + 1;

  if (blurhash.length !== 4 + 2 * numX * numY) {
    throw new ValidationError(
      `blurhash length mismatch: length is ${blurhash.length} but it should be ${4 + 2 * numX * numY}`,
    );
  }
};

export const isBlurhashValid = (blurhash: string): { result: boolean; errorReason?: string } => {
  try {
    validateBlurhash(blurhash);
  } catch (error) {
    return {
      result: false,
      errorReason: error instanceof Error ? error.message : "Unknown Error",
    };
  }

  return { result: true };
};

const decodeDC = (value: number) => {
  const intR = value >> 16;
  const intG = (value >> 8) & 255;
  const intB = value & 255;
  return [sRGBToLinear(intR), sRGBToLinear(intG), sRGBToLinear(intB)];
};

const decodeAC = (value: number, maximumValue: number) => {
  const quantR = Math.floor(value / (19 * 19));
  const quantG = Math.floor(value / 19) % 19;
  const quantB = value % 19;

  const rgb = [
    signPow((quantR - 9) / 9, 2.0) * maximumValue,
    signPow((quantG - 9) / 9, 2.0) * maximumValue,
    signPow((quantB - 9) / 9, 2.0) * maximumValue,
  ];

  return rgb;
};

export const decode = (blurhash: string, width: number, height: number, punch?: number) => {
  validateBlurhash(blurhash);

  punch = punch! | 1;

  const sizeFlag = decode83(blurhash[0]);
  const numY = Math.floor(sizeFlag / 9) + 1;
  const numX = (sizeFlag % 9) + 1;

  const quantisedMaximumValue = decode83(blurhash[1]);
  const maximumValue = (quantisedMaximumValue + 1) / 166;

  const colors = new Array(numX * numY);

  for (let i = 0; i < colors.length; i++) {
    if (i === 0) {
      const value = decode83(blurhash.substring(2, 6));
      colors[i] = decodeDC(value);
    } else {
      const value = decode83(blurhash.substring(4 + i * 2, 6 + i * 2));
      colors[i] = decodeAC(value, maximumValue * punch);
    }
  }

  const bytesPerRow = width * 4;
  const pixels = new Uint8ClampedArray(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;

      for (let j = 0; j < numY; j++) {
        const basisY = Math.cos((Math.PI * y * j) / height);
        for (let i = 0; i < numX; i++) {
          const basis = Math.cos((Math.PI * x * i) / width) * basisY;
          const color = colors[i + j * numX];
          r += color[0] * basis;
          g += color[1] * basis;
          b += color[2] * basis;
        }
      }

      let intR = linearTosRGB(r);
      let intG = linearTosRGB(g);
      let intB = linearTosRGB(b);

      pixels[4 * x + 0 + y * bytesPerRow] = intR;
      pixels[4 * x + 1 + y * bytesPerRow] = intG;
      pixels[4 * x + 2 + y * bytesPerRow] = intB;
      pixels[4 * x + 3 + y * bytesPerRow] = 255; // alpha
    }
  }
  return pixels;
};

type NumberTriplet = [number, number, number];

const bytesPerPixel = 4;

const multiplyBasisFunction = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  basisFunction: (i: number, j: number) => number,
): NumberTriplet => {
  let r = 0;
  let g = 0;
  let b = 0;
  const bytesPerRow = width * bytesPerPixel;

  for (let x = 0; x < width; x++) {
    const bytesPerPixelX = bytesPerPixel * x;

    for (let y = 0; y < height; y++) {
      const basePixelIndex = bytesPerPixelX + y * bytesPerRow;
      const basis = basisFunction(x, y);
      r += basis * sRGBToLinear(pixels[basePixelIndex]);
      g += basis * sRGBToLinear(pixels[basePixelIndex + 1]);
      b += basis * sRGBToLinear(pixels[basePixelIndex + 2]);
    }
  }

  let scale = 1 / (width * height);

  return [r * scale, g * scale, b * scale];
};

const encodeDC = (value: NumberTriplet): number => {
  const roundedR = linearTosRGB(value[0]);
  const roundedG = linearTosRGB(value[1]);
  const roundedB = linearTosRGB(value[2]);
  return (roundedR << 16) + (roundedG << 8) + roundedB;
};

const encodeAC = (value: NumberTriplet, maximumValue: number): number => {
  let quantR = Math.floor(Math.max(0, Math.min(18, Math.floor(signPow(value[0] / maximumValue, 0.5) * 9 + 9.5))));
  let quantG = Math.floor(Math.max(0, Math.min(18, Math.floor(signPow(value[1] / maximumValue, 0.5) * 9 + 9.5))));
  let quantB = Math.floor(Math.max(0, Math.min(18, Math.floor(signPow(value[2] / maximumValue, 0.5) * 9 + 9.5))));

  return quantR * 19 * 19 + quantG * 19 + quantB;
};

export const encode = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  componentX: number,
  componentY: number,
): string => {
  if (componentX < 1 || componentX > 9 || componentY < 1 || componentY > 9) {
    throw new ValidationError("BlurHash must have between 1 and 9 components");
  }
  if (width * height * 4 !== pixels.length) {
    throw new ValidationError("Width and height must match the pixels array");
  }

  let factors: Array<[number, number, number]> = [];
  for (let y = 0; y < componentY; y++) {
    for (let x = 0; x < componentX; x++) {
      const normalisation = x == 0 && y == 0 ? 1 : 2;
      const factor = multiplyBasisFunction(
        pixels,
        width,
        height,
        (i: number, j: number) =>
          normalisation * Math.cos((Math.PI * x * i) / width) * Math.cos((Math.PI * y * j) / height),
      );
      factors.push(factor);
    }
  }

  const dc = factors[0];
  const ac = factors.slice(1);

  let hash = "";

  let sizeFlag = componentX - 1 + (componentY - 1) * 9;
  hash += encode83(sizeFlag, 1);

  let maximumValue: number;
  if (ac.length > 0) {
    let actualMaximumValue = Math.max(...ac.map((val) => Math.max(...val)));
    let quantisedMaximumValue = Math.floor(Math.max(0, Math.min(82, Math.floor(actualMaximumValue * 166 - 0.5))));
    maximumValue = (quantisedMaximumValue + 1) / 166;
    hash += encode83(quantisedMaximumValue, 1);
  } else {
    maximumValue = 1;
    hash += encode83(0, 1);
  }

  hash += encode83(encodeDC(dc), 4);

  ac.forEach((factor) => {
    hash += encode83(encodeAC(factor, maximumValue), 2);
  });

  return hash;
};

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
    this.message = message;
  }
}

const sRGBToLinear = (value: number) => {
  let v = value / 255;
  if (v <= 0.04045) {
    return v / 12.92;
  } else {
    return Math.pow((v + 0.055) / 1.055, 2.4);
  }
};

const linearTosRGB = (value: number) => {
  let v = Math.max(0, Math.min(1, value));
  if (v <= 0.0031308) {
    return Math.trunc(v * 12.92 * 255 + 0.5);
  } else {
    return Math.trunc((1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255 + 0.5);
  }
};

const sign = (n: number) => (n < 0 ? -1 : 1);

const signPow = (val: number, exp: number) => sign(val) * Math.pow(Math.abs(val), exp);
