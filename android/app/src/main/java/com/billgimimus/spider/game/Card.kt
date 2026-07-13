package com.billgimimus.spider.game

enum class Suit(val symbol: String, val isRed: Boolean) {
    SPADES("♠", false),
    HEARTS("♥", true),
    DIAMONDS("♦", true),
    CLUBS("♣", false),
}

data class Card(
    val id: Int,
    val suit: Suit,
    val rank: Int,
    val faceUp: Boolean,
) {
    val rankLabel: String = when (rank) {
        1 -> "A"
        11 -> "J"
        12 -> "Q"
        13 -> "K"
        else -> rank.toString()
    }
}
