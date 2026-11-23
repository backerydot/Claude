package com.deutschtrainer.limit;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;

/**
 * Через цей вхід Deutsch-Trainer (німецька й хімія) повідомляє про вперше зданий урок:
 *   getContentResolver().call("content://com.deutschtrainer.limit.bonus", "grant", "de:a1-03", null)
 * Відповідь: granted (чи додано +5 хв), bankSec (скільки екстра-часу тепер у запасі).
 * Кликати можуть лише застосунки, підписані тим самим ключем, — чужі не накрутять хвилин.
 */
public class BonusProvider extends ContentProvider {
    @Override
    public Bundle call(String method, String arg, Bundle extras) {
        Context c = getContext();
        String caller = getCallingPackage();
        if (c == null || caller == null) throw new SecurityException("невідомий застосунок");
        if (!caller.equals(c.getPackageName())
                && c.getPackageManager().checkSignatures(caller, c.getPackageName()) != PackageManager.SIGNATURE_MATCH) {
            throw new SecurityException("чужий підпис: " + caller);
        }
        Bundle out = new Bundle();
        if ("grant".equals(method)) {
            out.putBoolean("granted", Limits.grantBonus(c, arg));
            out.putInt("minutes", Limits.BONUS_MIN);
        }
        out.putLong("bankSec", Limits.bankSec(c));
        return out;
    }

    @Override public boolean onCreate() { return true; }
    @Override public Cursor query(Uri u, String[] p, String s, String[] a, String o) { return null; }
    @Override public String getType(Uri u) { return null; }
    @Override public Uri insert(Uri u, ContentValues v) { return null; }
    @Override public int delete(Uri u, String s, String[] a) { return 0; }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { return 0; }
}
