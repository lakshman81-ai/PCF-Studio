const fs = require('fs');

// We don't have the full raw test environment but we can look at the logs you provided in the main prompt:
// Let's inspect how the ray cast logic from the logs matches up with OLETs:
// S3-P2	ray-cast	67132086/1349	origin:{"x":181425,"y":150322.45,"z":100780.148}  dir:{"x":0,"y":0,"z":-1}  cp:{"x":181425,"y":150322.45,"z":100927.798}
// S3-P2	ray-cast	67132086/1350	origin:{"x":181277.35,"y":150182.45,"z":100927.798}  dir:{"x":-1,"y":0,"z":0}  cp:{"x":181425,"y":150182.45,"z":100927.798}
