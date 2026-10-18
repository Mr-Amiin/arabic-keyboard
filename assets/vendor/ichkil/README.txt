Ichkil Arabic Tashkeel model — self-hosted copy
================================================
Files:    model.onnx (5,068,871 bytes), config.json, SHA256SUMS
Source:   https://huggingface.co/ichkil/ichkil  (official repository)
Author:   Maaouia BenHamed
License:  MIT (the model repository and the `ichkil` JS package are MIT-licensed;
          the package's license text is reproduced in LICENSE-ichkil.txt)
SHA-256 of model.onnx: 9055816b214346b0a8044a4a8deceb36e818dffd0b04699715ea23883bf54744
Verified against SHA256SUMS when this copy was added, and re-verified in the
visitor's browser every time the model is loaded (assets/js/tashkeel-engine.js).

Contract: input_ids int64 [batch, seq] -> logits float32 [batch, seq, 13];
          max_seq_len 1024.
This site runs the model in the browser with ONNX Runtime Web; no text is sent
to any server.
