package com.billgimimus.spider.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColors = darkColorScheme(
    primary = Color(0xFF4CAF50),
    onPrimary = Color.White,
    background = Color(0xFF0B3A1E),
    onBackground = Color.White,
    surface = Color(0xFF124F2C),
    onSurface = Color.White,
)

private val LightColors = lightColorScheme(
    primary = Color(0xFF2E7D32),
    onPrimary = Color.White,
    background = Color(0xFF1B5E20),
    onBackground = Color.White,
    surface = Color(0xFF2E7D32),
    onSurface = Color.White,
)

@Composable
fun SpiderTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (dark) DarkColors else LightColors,
        content = content,
    )
}

object Felt {
    val TableGreen = Color(0xFF0F5132)
    val CardBack = Color(0xFF1B3A6B)
    val CardBackAccent = Color(0xFF2C5AA0)
    val CardFace = Color(0xFFFFFDF7)
    val CardBorder = Color(0xFF222222)
    val CardBorderMoving = Color(0xFFFFC107)
    val Red = Color(0xFFB00020)
    val Black = Color(0xFF111111)
    val EmptySlot = Color(0x33FFFFFF)
}
