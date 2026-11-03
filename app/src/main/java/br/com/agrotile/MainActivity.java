package br.com.agrotile;

import android.app.Activity;
import android.os.Bundle;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class MainActivity extends Activity {
    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        int padding = Math.round(24 * getResources().getDisplayMetrics().density);
        content.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText(getApplicationInfo().loadLabel(getPackageManager()));
        title.setTextSize(26);
        content.addView(title);
        setContentView(content);
    }
}
