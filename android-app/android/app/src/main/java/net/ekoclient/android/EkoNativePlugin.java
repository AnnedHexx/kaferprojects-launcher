package net.ekoclient.android;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;

import androidx.core.app.NotificationCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Iterator;
import java.util.Random;

@CapacitorPlugin(name = "EkoNative")
public class EkoNativePlugin extends Plugin {

    private static final byte[] RAKNET_MAGIC = new byte[] {
        0x00, (byte) 0xff, (byte) 0xff, 0x00,
        (byte) 0xfe, (byte) 0xfe, (byte) 0xfe, (byte) 0xfe,
        (byte) 0xfd, (byte) 0xfd, (byte) 0xfd, (byte) 0xfd,
        0x12, 0x34, 0x56, 0x78
    };

    @PluginMethod
    public void pingServer(PluginCall call) {
        String ip = call.getString("ip", "");
        int port = call.getInt("port", 19132);
        new Thread(() -> {
            JSObject result = new JSObject();
            result.put("online", false);
            if (ip == null || ip.trim().isEmpty()) {
                call.resolve(result);
                return;
            }
            try (DatagramSocket socket = new DatagramSocket()) {
                socket.setSoTimeout(2500);
                InetAddress address = InetAddress.getByName(ip.trim());
                ByteBuffer out = ByteBuffer.allocate(33);
                out.order(ByteOrder.BIG_ENDIAN);
                out.put((byte) 0x01);
                out.putLong(System.currentTimeMillis());
                out.put(RAKNET_MAGIC);
                out.putLong(new Random().nextLong());
                byte[] payload = out.array();

                long started = System.nanoTime();
                socket.send(new DatagramPacket(payload, payload.length, address, port));

                byte[] buffer = new byte[4096];
                DatagramPacket response = new DatagramPacket(buffer, buffer.length);
                socket.receive(response);
                long latency = (System.nanoTime() - started) / 1_000_000L;

                ByteBuffer in = ByteBuffer.wrap(buffer, 0, response.getLength());
                in.order(ByteOrder.BIG_ENDIAN);
                if (in.get() != 0x1c) {
                    call.resolve(result);
                    return;
                }
                in.getLong(); // timestamp
                in.getLong(); // server guid
                in.position(in.position() + RAKNET_MAGIC.length);
                int length = in.getShort() & 0xFFFF;
                byte[] motdBytes = new byte[length];
                in.get(motdBytes);
                String motd = new String(motdBytes, StandardCharsets.UTF_8);

                result.put("online", true);
                result.put("edition", "bedrock");
                result.put("latencyMs", latency);
                result.put("motd", motd);

                String[] parts = motd.split(";", -1);
                if (parts.length >= 6) {
                    try {
                        result.put("players", Integer.parseInt(parts[4].trim()));
                        result.put("maxPlayers", Integer.parseInt(parts[5].trim()));
                    } catch (NumberFormatException ignored) {
                        result.put("playersUnknown", true);
                    }
                    if (parts.length >= 4) result.put("version", parts[3]);
                } else {
                    result.put("playersUnknown", true);
                }
                call.resolve(result);
            } catch (Exception error) {
                call.resolve(result);
            }
        }).start();
    }

    @PluginMethod
    public void openMinecraft(PluginCall call) {
        JSObject result = new JSObject();
        try {
            Intent intent = getContext().getPackageManager().getLaunchIntentForPackage("com.mojang.minecraftpe");
            if (intent == null) {
                result.put("ok", false);
                result.put("error", "not-installed");
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                result.put("ok", true);
            }
        } catch (Exception error) {
            result.put("ok", false);
            result.put("error", "launch-failed");
        }
        call.resolve(result);
    }

    @PluginMethod
    public void httpRequest(PluginCall call) {
        String url = call.getString("url", "");
        String method = call.getString("method", "GET");
        JSObject headers = call.getObject("headers");
        String body = call.getString("body", null);

        new Thread(() -> {
            JSObject result = new JSObject();
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setRequestMethod(method == null ? "GET" : method.toUpperCase());
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(25000);
                connection.setInstanceFollowRedirects(true);
                if (headers != null) {
                    Iterator<String> keys = headers.keys();
                    while (keys.hasNext()) {
                        String key = keys.next();
                        connection.setRequestProperty(key, headers.getString(key));
                    }
                }
                if (body != null && !body.isEmpty()) {
                    connection.setDoOutput(true);
                    try (OutputStream output = connection.getOutputStream()) {
                        output.write(body.getBytes(StandardCharsets.UTF_8));
                    }
                }
                int status = connection.getResponseCode();
                InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                String text = readAll(stream);
                Object data = text;
                try {
                    data = new JSONObject(text);
                } catch (Exception ignored) {}
                result.put("ok", status >= 200 && status < 300);
                result.put("status", status);
                result.put("data", data);
            } catch (Exception error) {
                result.put("ok", false);
                result.put("status", 0);
                result.put("error", error.getMessage() == null ? "Error de red" : error.getMessage());
            } finally {
                if (connection != null) connection.disconnect();
            }
            call.resolve(result);
        }).start();
    }

    @PluginMethod
    public void fetchImage(PluginCall call) {
        String url = call.getString("url", "");
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(25000);
                String type = connection.getContentType();
                if (type == null || !type.startsWith("image/")) type = "image/png";
                byte[] bytes = readBytes(connection.getInputStream());
                String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                call.resolve(new JSObject().put("dataUrl", "data:" + type + ";base64," + base64));
            } catch (Exception error) {
                call.reject("No se pudo cargar la imagen");
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url", "");
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception error) {
            call.reject("No se pudo abrir el enlace");
        }
    }

    @PluginMethod
    public void getSystemInfo(PluginCall call) {
        JSObject result = new JSObject();
        try {
            Runtime runtime = Runtime.getRuntime();
            long totalMb = runtime.maxMemory() / (1024L * 1024L);
            long freeMb = runtime.freeMemory() / (1024L * 1024L);
            result.put("cpu", Build.HARDWARE);
            result.put("cores", runtime.availableProcessors());
            result.put("memoryTotalMb", totalMb);
            result.put("memoryFreeMb", freeMb);
            result.put("platform", "Android " + Build.VERSION.RELEASE);
            result.put("arch", Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "arm64-v8a");
            result.put("hostname", Build.MODEL);
            result.put("displays", new org.json.JSONArray());
        } catch (Exception ignored) {}
        call.resolve(result);
    }

    @PluginMethod
    public void notifyUser(PluginCall call) {
        String title = call.getString("title", "EKO Client");
        String body = call.getString("body", "");
        try {
            Context context = getContext();
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) {
                call.resolve();
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                    "eko-client", "EKO Client", NotificationManager.IMPORTANCE_DEFAULT);
                manager.createNotificationChannel(channel);
            }
            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, "eko-client")
                .setSmallIcon(context.getApplicationInfo().icon)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true);
            manager.notify((int) (System.currentTimeMillis() % 100000), builder.build());
        } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void installAddon(PluginCall call) {
        String url = call.getString("url", "");
        String rawName = call.getString("name", "eko-addon");
        String expectedHash = call.getString("sha256", null);

        new Thread(() -> {
            HttpURLConnection connection = null;
            File target = null;
            try {
                if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) {
                    call.reject("El enlace del pack no es válido");
                    return;
                }
                String cleanName = String.valueOf(rawName == null ? "eko-addon" : rawName)
                    .replaceAll("[\\\\/:*?\"<>|]", " ")
                    .replaceAll("\\s+", " ")
                    .trim();
                if (cleanName.isEmpty()) cleanName = "eko-addon";
                if (cleanName.length() > 60) cleanName = cleanName.substring(0, 60);

                String lower = url.toLowerCase().split("\\?")[0];
                String extension = ".mcaddon";
                for (String candidate : new String[] { ".mcaddon", ".mcpack", ".mcworld", ".mctemplate" }) {
                    if (lower.endsWith(candidate)) {
                        extension = candidate;
                        break;
                    }
                }

                File dir = new File(getContext().getCacheDir(), "eko-addons");
                if (!dir.exists() && !dir.mkdirs()) {
                    call.reject("No se pudo preparar la caché de descargas");
                    return;
                }
                target = new File(dir, cleanName + extension);

                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(60000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("User-Agent", "EKOClient/1.0.3");
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    call.reject("No se pudo descargar el pack (HTTP " + status + ")");
                    return;
                }

                long total = 0;
                long limit = 300L * 1024L * 1024L;
                try (InputStream input = connection.getInputStream();
                     FileOutputStream output = new FileOutputStream(target)) {
                    byte[] buffer = new byte[8192];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        total += read;
                        if (total > limit) throw new IOException("El pack supera el tamaño máximo permitido");
                        output.write(buffer, 0, read);
                    }
                }
                connection.disconnect();
                connection = null;

                if (total == 0) {
                    target.delete();
                    call.reject("El archivo descargado está vacío");
                    return;
                }

                if (expectedHash != null && !expectedHash.trim().isEmpty()) {
                    String actual = sha256Of(target);
                    if (!actual.equalsIgnoreCase(expectedHash.trim())) {
                        target.delete();
                        call.reject("El archivo no coincide con la firma esperada");
                        return;
                    }
                }

                openAddonWithMinecraft(target);

                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("path", target.getAbsolutePath());
                result.put("size", total);
                call.resolve(result);
            } catch (ActivityNotFoundException notFound) {
                call.reject("No encontré Minecraft instalado en este dispositivo");
            } catch (Exception error) {
                if (target != null && target.exists() && target.length() == 0) target.delete();
                String message = error.getMessage();
                call.reject(message == null || message.isEmpty() ? "No se pudo instalar el pack" : message);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void installAddonFile(PluginCall call) {
        String rawName = call.getString("name", "eko-addon");
        String rawFileName = call.getString("fileName", "pack.mcaddon");
        String base64 = call.getString("data", "");

        new Thread(() -> {
            File target = null;
            try {
                if (base64 == null || base64.isEmpty()) {
                    call.reject("No se recibió el archivo del pack");
                    return;
                }
                byte[] bytes;
                try {
                    bytes = Base64.decode(base64, Base64.DEFAULT);
                } catch (IllegalArgumentException decodeError) {
                    call.reject("El archivo del pack está dañado");
                    return;
                }
                if (bytes.length == 0) {
                    call.reject("El archivo del pack está vacío");
                    return;
                }
                if (bytes.length > 300L * 1024L * 1024L) {
                    call.reject("El pack supera el tamaño máximo permitido");
                    return;
                }

                String cleanName = String.valueOf(rawName == null ? "eko-addon" : rawName)
                    .replaceAll("[\\\\/:*?\"<>|]", " ")
                    .replaceAll("\\s+", " ")
                    .trim();
                if (cleanName.isEmpty()) cleanName = "eko-addon";
                if (cleanName.length() > 60) cleanName = cleanName.substring(0, 60);

                String lowerName = String.valueOf(rawFileName == null ? "" : rawFileName).toLowerCase();
                String extension = ".mcaddon";
                for (String candidate : new String[] { ".mcaddon", ".mcpack", ".mcworld", ".mctemplate" }) {
                    if (lowerName.endsWith(candidate)) {
                        extension = candidate;
                        break;
                    }
                }

                File dir = new File(getContext().getCacheDir(), "eko-addons");
                if (!dir.exists() && !dir.mkdirs()) {
                    call.reject("No se pudo preparar la caché de descargas");
                    return;
                }
                target = new File(dir, cleanName + extension);
                try (FileOutputStream output = new FileOutputStream(target)) {
                    output.write(bytes);
                }

                openAddonWithMinecraft(target);

                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("path", target.getAbsolutePath());
                result.put("size", bytes.length);
                call.resolve(result);
            } catch (ActivityNotFoundException notFound) {
                call.reject("No encontré Minecraft instalado en este dispositivo");
            } catch (Exception error) {
                String message = error.getMessage();
                call.reject(message == null || message.isEmpty() ? "No se pudo instalar el pack" : message);
            }
        }).start();
    }

    private void openAddonWithMinecraft(File file) {
        Context context = getContext();
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/octet-stream");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(intent);
        } catch (ActivityNotFoundException firstError) {
            Intent fallback = new Intent(Intent.ACTION_VIEW);
            fallback.setDataAndType(uri, "*/*");
            fallback.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(fallback);
        }
    }

    private static String sha256Of(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new java.io.FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }
        StringBuilder builder = new StringBuilder();
        for (byte value : digest.digest()) {
            builder.append(String.format("%02x", value & 0xff));
        }
        return builder.toString();
    }

    private static String readAll(InputStream stream) throws Exception {
        if (stream == null) return "";
        byte[] bytes = readBytes(stream);
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private static byte[] readBytes(InputStream stream) throws Exception {
        if (stream == null) return new byte[0];
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = stream.read(buffer)) != -1) {
            output.write(buffer, 0, read);
        }
        stream.close();
        return output.toByteArray();
    }
}
