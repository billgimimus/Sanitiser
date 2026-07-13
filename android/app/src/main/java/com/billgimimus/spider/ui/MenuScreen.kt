package com.billgimimus.spider.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.billgimimus.spider.game.Difficulty
import com.billgimimus.spider.ui.theme.Felt

@Composable
fun MenuScreen(onPick: (Difficulty) -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Felt.TableGreen),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(32.dp),
        ) {
            Text(
                text = "Spider Solitaire",
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
                color = Felt.CardFace,
            )
            Spacer(Modifier.height(48.dp))
            Difficulty.values().forEach { d ->
                Button(
                    onClick = { onPick(d) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                ) {
                    Text(d.label, fontSize = 18.sp)
                }
            }
        }
    }
}
