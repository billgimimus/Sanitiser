package com.billgimimus.spider

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.billgimimus.spider.ui.GameScreen
import com.billgimimus.spider.ui.GameViewModel
import com.billgimimus.spider.ui.MenuScreen
import com.billgimimus.spider.ui.Screen
import com.billgimimus.spider.ui.theme.SpiderTheme

class MainActivity : ComponentActivity() {
    private val vm: GameViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { App(vm) }
    }
}

@Composable
private fun App(vm: GameViewModel) {
    SpiderTheme {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.systemBars),
        ) {
            when (vm.screen) {
                Screen.Menu -> MenuScreen(onPick = { vm.startNewGame(it) })
                Screen.Game -> GameScreen(vm)
            }
        }
    }
}
