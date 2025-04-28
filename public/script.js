<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>M∆THM∆TIΧ AI</title>

  <!-- MathLive -->
  <script src="https://unpkg.com/mathlive"></script>

  <!-- MathJax -->
  <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
  <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>

  <!-- Styles -->
  <link rel="stylesheet" href="style.css">
</head>
<body>

  <!-- Logo -->
  <div id="logo-header">
    <img src="MathMatix AI Logo.png" alt="Mathmatix AI Logo">
  </div>

  <!-- Chat Container -->
  <div id="chat-container">
    <div id="chat-container-inner"></div>
    <div id="input-area">
      <input type="text" id="user-input" placeholder="Type your message...">
      <button id="send-button">Send</button>
    </div>
  </div>

  <!-- Upload Dropzone -->
  <div id="dropzone" class="hidden">
    <div id="dropzone-content">
      📄 Drop your file here
    </div>
  </div>

  <!-- Floating Toolbar -->
  <div id="floating-toolbar">
    <button id="equation-button" class="tool-button" title="Insert Equation">➕</button>
    <button id="calculator-button" class="tool-button" title="Calculator">🧮</button>
    <button id="scratchpad-button" class="tool-button" title="Sketchpad">✏️</button>
    <button id="upload-button" class="tool-button" title="Upload File">📁</button>
  </div>

  <!-- Calculator Popup -->
  <div id="calculator-popup" class="popup hidden">
    <div class="popup-header">
      <span>Calculator</span>
      <button id="close-calculator" class="close-btn">✖️</button>
    </div>
    <iframe src="https://www.desmos.com/fourfunction" frameborder="0" style="width:100%; height:400px;"></iframe>
  </div>

  <!-- Sketch Pad Popup -->
  <div id="sketchpad-popup" class="popup hidden">
    <div class="popup-header">
      <span>Sketch Pad</span>
      <button id="close-sketchpad" class="close-btn">✖️</button>
    </div>
    <canvas id="sketch-canvas" width="500" height="400"></canvas>
    <div style="margin-top:10px;">
      <button id="clear-sketch">Clear</button>
    </div>
  </div>

  <!-- Main JavaScript -->
  <script src="script.js"></script>

</body>
</html>
