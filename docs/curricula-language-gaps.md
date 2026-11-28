# Curricula whose teaching language Jooma cannot write yet

Owner's rule (2026-11-27): a curriculum whose teaching language is not a Jooma output language (`app/lib/languages.ts`) defaults to English for now. Every such curriculum is listed here, so that when output languages are added, these defaults can be changed. A unit test reads this list, so add a row whenever an entry like this is built.

Jooma's non-English output languages today: German, Spanish (Spain voice), Estonian, French, Italian, Polish, Portuguese (Portugal), Portuguese (Brazil), Swedish.

When a language is added: switch the listed entries' `defaultLanguage` (only teachers who never chose a language are affected), rerun their prompt tests, and do one live run per language.

## Stage 2 (built, English-medium in at least part of the system)

These defaulted to English because English is one of the teaching languages. A local language would be an option, not a fix.

| Curriculum | Other teaching languages |
|---|---|
| India (CBSE) | Hindi |
| Pakistan | Urdu |
| Philippines | Filipino |
| Malaysia | Malay, Chinese, Tamil |
| Singapore | Chinese, Malay, Tamil (mother tongue subjects) |
| Hong Kong | Chinese (Cantonese) |
| United Arab Emirates (MoE) | Arabic |
| Kenya, Uganda | Kiswahili |
| South Africa | Afrikaans, isiZulu, isiXhosa and others |
| Malta | Maltese |

## Stage 3 (planned, see `docs/curricula-stage3-plan.md`)

These need their own language most, because state schools teach mainly in it.

| Language | Curricula |
|---|---|
| Arabic | Saudi Arabia, Qatar, Kuwait, Oman, Bahrain, Jordan, Egypt (and Israel's Arabic-medium schools) |
| Hebrew | Israel |
| Turkish | Turkey (Türkiye) |
| Chinese (Simplified) | China |
| Chinese (Traditional) | Taiwan |
| Japanese | Japan |
| Korean | South Korea |
| Vietnamese | Vietnam |
| Thai | Thailand |
| Indonesian | Indonesia |
| Bengali | Bangladesh |
| Sinhala, Tamil | Sri Lanka |
| Nepali | Nepal |
| Dutch | Netherlands, Belgium (Flemish Community) |
| Danish | Denmark |
| Norwegian | Norway |
| Finnish | Finland |
| Icelandic | Iceland |
| Greek | Greece, Cyprus |
| Czech | Czech Republic |
| Slovak | Slovakia |
| Hungarian | Hungary |
| Romanian | Romania |
| Bulgarian | Bulgaria |
| Croatian | Croatia |
| Serbian | Serbia |
| Slovenian | Slovenia |
| Latvian | Latvia |
| Lithuanian | Lithuania |
| Ukrainian | Ukraine |
| German, French, Italian (several at once) | Switzerland: three of its languages are Jooma languages, but no single one fits every canton, so it defaults to English; Belgium likewise (Dutch is not a Jooma language, French and German are) |
| Spanish (Latin America, es-419) | Argentina, Chile, Colombia, Mexico, Peru: default to Jooma's Spanish with a Latin American usage note in the curriculum line (owner, 2026-11-28); speech stays es-ES until es-419 is added |
| Amharic | Ethiopia (primary) |
| Kinyarwanda | Rwanda (early primary) |
| Kiswahili | Tanzania (primary) |

Rwanda, Tanzania (secondary), Zambia, Zimbabwe and Ethiopia (secondary) teach in English at least from upper primary, so English is a fair default there, not just a stopgap.
