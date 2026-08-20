import { LanguageCode } from "@vendure/common/lib/generated-types";
import { CountryDefinition, dummyPaymentHandler, InitialData } from "@vendure/core";

/**
 * Grouped by zone rather than listed flat, because the zone is the only piece of
 * information a `CountryDefinition` carries that is not derivable from the ISO code,
 * and grouping keeps the assignment reviewable.
 *
 * Transcontinental countries are placed where a shop would most likely want them for
 * shipping/tax purposes, not where a geographer would put them (RU and TR in Europe,
 * the Caucasus states in Asia).
 */
const countriesByZone: Record<string, Array<[code: string, name: string]>> = {
  Europe: [
    ["AD", "Andorra"], ["AL", "Albania"], ["AT", "Austria"], ["AX", "Åland Islands"],
    ["BA", "Bosnia and Herzegovina"], ["BE", "Belgium"], ["BG", "Bulgaria"], ["BY", "Belarus"],
    ["CH", "Switzerland"], ["CY", "Cyprus"], ["CZ", "Czechia"], ["DE", "Germany"],
    ["DK", "Denmark"], ["EE", "Estonia"], ["ES", "Spain"], ["FI", "Finland"],
    ["FO", "Faroe Islands"], ["FR", "France"], ["GB", "United Kingdom"], ["GG", "Guernsey"],
    ["GI", "Gibraltar"], ["GR", "Greece"], ["HR", "Croatia"], ["HU", "Hungary"],
    ["IE", "Ireland"], ["IM", "Isle of Man"], ["IS", "Iceland"], ["IT", "Italy"],
    ["JE", "Jersey"], ["LI", "Liechtenstein"], ["LT", "Lithuania"], ["LU", "Luxembourg"],
    ["LV", "Latvia"], ["MC", "Monaco"], ["MD", "Moldova"], ["ME", "Montenegro"],
    ["MK", "North Macedonia"], ["MT", "Malta"], ["NL", "Netherlands"], ["NO", "Norway"],
    ["PL", "Poland"], ["PT", "Portugal"], ["RO", "Romania"], ["RS", "Serbia"],
    ["RU", "Russia"], ["SE", "Sweden"], ["SI", "Slovenia"], ["SJ", "Svalbard and Jan Mayen"],
    ["SK", "Slovakia"], ["SM", "San Marino"], ["TR", "Türkiye"], ["UA", "Ukraine"],
    ["VA", "Vatican City"],
  ],
  Americas: [
    ["AG", "Antigua and Barbuda"], ["AI", "Anguilla"], ["AR", "Argentina"], ["AW", "Aruba"],
    ["BB", "Barbados"], ["BL", "Saint Barthélemy"], ["BM", "Bermuda"], ["BO", "Bolivia"],
    ["BQ", "Caribbean Netherlands"], ["BR", "Brazil"], ["BS", "Bahamas"], ["BZ", "Belize"],
    ["CA", "Canada"], ["CL", "Chile"], ["CO", "Colombia"], ["CR", "Costa Rica"],
    ["CU", "Cuba"], ["CW", "Curaçao"], ["DM", "Dominica"], ["DO", "Dominican Republic"],
    ["EC", "Ecuador"], ["FK", "Falkland Islands"], ["GD", "Grenada"], ["GF", "French Guiana"],
    ["GL", "Greenland"], ["GP", "Guadeloupe"], ["GT", "Guatemala"], ["GY", "Guyana"],
    ["HN", "Honduras"], ["HT", "Haiti"], ["JM", "Jamaica"], ["KN", "Saint Kitts and Nevis"],
    ["KY", "Cayman Islands"], ["LC", "Saint Lucia"], ["MF", "Saint Martin"], ["MQ", "Martinique"],
    ["MS", "Montserrat"], ["MX", "Mexico"], ["NI", "Nicaragua"], ["PA", "Panama"],
    ["PE", "Peru"], ["PM", "Saint Pierre and Miquelon"], ["PR", "Puerto Rico"], ["PY", "Paraguay"],
    ["SR", "Suriname"], ["SV", "El Salvador"], ["SX", "Sint Maarten"], ["TC", "Turks and Caicos Islands"],
    ["TT", "Trinidad and Tobago"], ["US", "United States of America"], ["UY", "Uruguay"],
    ["VC", "Saint Vincent and the Grenadines"], ["VE", "Venezuela"], ["VG", "British Virgin Islands"],
    ["VI", "U.S. Virgin Islands"],
  ],
};

export const devCountries: CountryDefinition[] = Object.entries(countriesByZone).flatMap(([zone, entries]) =>
  entries.map(([code, name]) => ({ code, name, zone })),
);

/** Orders seeded by the dev seeder pay with this method, so it must settle without user interaction. */
export const DEV_PAYMENT_METHOD_CODE = "dummy-payment-settled";

/**
 * A superset of the e2e initial data: same tax/shipping shape, but with every ISO country and a
 * payment method attached, so a freshly seeded dev database behaves like a real installation
 * rather than one where every checkout dead-ends for lack of an eligible payment method.
 */
export const devInitialData: InitialData = {
  defaultLanguage: LanguageCode.en,
  defaultZone: "Europe",
  countries: devCountries,
  taxRates: [
    { name: "Standard Tax", percentage: 20 },
    { name: "Reduced Tax", percentage: 10 },
    { name: "Zero Tax", percentage: 0 },
  ],
  shippingMethods: [
    { name: "Standard Shipping", price: 500 },
    { name: "Express Shipping", price: 1000 },
  ],
  paymentMethods: [
    {
      name: "Dummy Payment (settled)",
      handler: {
        code: dummyPaymentHandler.code,
        arguments: [{ name: "automaticSettle", value: "true" }],
      },
    },
    {
      name: "Dummy Payment (authorized)",
      handler: {
        code: dummyPaymentHandler.code,
        arguments: [{ name: "automaticSettle", value: "false" }],
      },
    },
  ],
  collections: [
    {
      name: "Electronics",
      filters: [{ code: "facet-value-filter", args: { facetValueNames: ["electronics"], containsAny: false } }],
    },
    {
      name: "Plants",
      filters: [{ code: "facet-value-filter", args: { facetValueNames: ["plants"], containsAny: false } }],
    },
    {
      name: "Sports Equipment",
      filters: [{ code: "facet-value-filter", args: { facetValueNames: ["sports equipment"], containsAny: false } }],
    },
  ],
};
