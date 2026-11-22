package com.tabby.app;

import android.Manifest;
import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Reads SMS from the phone's inbox so bank and card alerts can be turned into
 * transactions. Read-only: it never sends, deletes or changes messages.
 * Filtering (bank senders only, no OTPs) happens in
 * src/features/finance/sms.ts before anything leaves the phone, and again on
 * the server.
 */
@CapacitorPlugin(
    name = "SmsInbox",
    permissions = { @Permission(strings = { Manifest.permission.READ_SMS }, alias = "sms") }
)
public class SmsInboxPlugin extends Plugin {

    private static final int MAX_LIMIT = 1000;

    /** read({ since: epochMillis, limit }) -> { messages: [{ address, body, date }] }, oldest first. */
    @PluginMethod
    public void read(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "afterPermission");
            return;
        }
        doRead(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            doRead(call);
        } else {
            call.reject("SMS permission was not granted", "PERMISSION_DENIED");
        }
    }

    private void doRead(PluginCall call) {
        long since = call.getLong("since", 0L);
        int limit = Math.max(1, Math.min(call.getInt("limit", 500), MAX_LIMIT));

        JSArray out = new JSArray();
        ContentResolver resolver = getContext().getContentResolver();
        Uri inbox = Uri.parse("content://sms/inbox");
        String[] projection = { "address", "body", "date" };
        Cursor cursor = null;
        try {
            cursor = resolver.query(inbox, projection, "date > ?", new String[] { String.valueOf(since) }, "date ASC");
            if (cursor != null) {
                int iAddress = cursor.getColumnIndexOrThrow("address");
                int iBody = cursor.getColumnIndexOrThrow("body");
                int iDate = cursor.getColumnIndexOrThrow("date");
                int count = 0;
                while (cursor.moveToNext() && count < limit) {
                    JSObject m = new JSObject();
                    m.put("address", cursor.getString(iAddress));
                    m.put("body", cursor.getString(iBody));
                    m.put("date", cursor.getLong(iDate));
                    out.put(m);
                    count++;
                }
            }
        } catch (Exception e) {
            call.reject("Could not read SMS: " + e.getMessage(), "READ_FAILED", e);
            return;
        } finally {
            if (cursor != null) cursor.close();
        }

        JSObject result = new JSObject();
        result.put("messages", out);
        call.resolve(result);
    }
}
