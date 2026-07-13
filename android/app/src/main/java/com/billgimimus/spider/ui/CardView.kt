package com.billgimimus.spider.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.billgimimus.spider.game.Card
import com.billgimimus.spider.ui.theme.Felt

@Composable
fun CardView(
    card: Card,
    width: Dp,
    height: Dp,
    selected: Boolean = false,
    onClick: (() -> Unit)? = null,
) {
    val border = if (selected) Felt.CardBorderMoving else Felt.CardBorder
    val shape = RoundedCornerShape(width * 0.12f)
    Box(
        modifier = Modifier
            .size(width = width, height = height)
            .clip(shape)
            .background(if (card.faceUp) Felt.CardFace else Felt.CardBack)
            .border(width = if (selected) 2.dp else 1.dp, color = border, shape = shape)
            .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier),
    ) {
        if (card.faceUp) {
            CardFace(card, width, height)
        } else {
            CardBack(width, height)
        }
    }
}

@Composable
fun EmptySlot(width: Dp, height: Dp, onClick: (() -> Unit)? = null) {
    val shape = RoundedCornerShape(width * 0.12f)
    Box(
        modifier = Modifier
            .size(width = width, height = height)
            .clip(shape)
            .border(1.dp, Felt.EmptySlot, shape)
            .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier),
    )
}

@Composable
private fun CardFace(card: Card, width: Dp, height: Dp) {
    val color = if (card.suit.isRed) Felt.Red else Felt.Black
    val cornerFont = (width.value * 0.32f).sp
    val centerFont = (width.value * 0.62f).sp
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = width * 0.08f, vertical = height * 0.05f),
    ) {
        Text(
            text = card.rankLabel,
            color = color,
            fontSize = cornerFont,
            fontWeight = FontWeight.Bold,
            lineHeight = cornerFont,
        )
        Text(
            text = card.suit.symbol,
            color = color,
            fontSize = cornerFont,
            lineHeight = cornerFont,
        )
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                text = card.suit.symbol,
                color = color,
                fontSize = centerFont,
                lineHeight = centerFont,
            )
        }
    }
}

@Composable
private fun CardBack(width: Dp, height: Dp) {
    Canvas(modifier = Modifier.fillMaxSize()) {
        val stripe = size.width * 0.15f
        drawRect(color = Felt.CardBack, size = Size(size.width, size.height))
        var i = -size.height
        while (i < size.width) {
            drawRect(
                color = Felt.CardBackAccent,
                topLeft = Offset(i, 0f),
                size = Size(stripe, size.height),
            )
            i += stripe * 3
        }
        drawRect(color = Color(0x33000000), size = size, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2f))
    }
}

