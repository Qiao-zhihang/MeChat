// Shared canvas and Socket.IO setup.

const socket = io();
const canvas = document.getElementById('worldCanvas');
const ctx = canvas.getContext('2d');
