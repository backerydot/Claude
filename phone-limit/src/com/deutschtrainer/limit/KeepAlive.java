package com.deutschtrainer.limit;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;

/**
 * Постійне тихе сповіщення від охоронця. Воно робить службу «передньою» —
 * MIUI та інші оболонки тоді не вбивають її для економії батареї
 * (саме так охоронці колись «тихо» зупинились). Заодно показує, скільки лишилось часу.
 */
final class KeepAlive {
    private static final String CHANNEL = "guard";
    private static final int ID = 7;
    private static String shown = "";

    private KeepAlive() {}

    static void show(Service s, String title, String text) {
        String key = title + "|" + text;
        if (key.equals(shown)) return; // нічого не змінилось — не смикаємо систему
        try {
            NotificationManager nm = s.getSystemService(NotificationManager.class);
            if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Охоронець ліміту", NotificationManager.IMPORTANCE_LOW);
                ch.setShowBadge(false);
                ch.setSound(null, null);
                nm.createNotificationChannel(ch);
            }
            PendingIntent open = PendingIntent.getActivity(s, 0,
                    new Intent(s, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification n = new Notification.Builder(s, CHANNEL)
                    .setSmallIcon(R.drawable.ic_stat)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setContentIntent(open)
                    .setOngoing(true)
                    .setOnlyAlertOnce(true)
                    .setShowWhen(false)
                    .build();
            if (shown.isEmpty()) {
                if (Build.VERSION.SDK_INT >= 34) s.startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
                else s.startForeground(ID, n);
            } else if (nm != null) {
                nm.notify(ID, n);
            }
            shown = key;
        } catch (RuntimeException ignored) {
            // Система не дозволила — охоронець працює й без сповіщення
        }
    }

    static void hide(Service s) {
        shown = "";
        try { s.stopForeground(Service.STOP_FOREGROUND_REMOVE); } catch (RuntimeException ignored) { }
    }
}
