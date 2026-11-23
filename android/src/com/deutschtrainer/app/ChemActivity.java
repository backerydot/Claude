package com.deutschtrainer.app;

/**
 * Друга іконка застосунку — «Хімія». Той самий WebView, але відкриває розділ chem/ сайту
 * і дає сторінці window.ChemApp (за вперше зданий урок — +5 хв у «Ліміті»).
 * Оскільки це той самий застосунок, «Ліміт» час у хімії не рахує.
 */
public class ChemActivity extends MainActivity {
    @Override
    boolean isChem() {
        return true;
    }
}
