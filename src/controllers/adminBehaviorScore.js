import { getBehaviorScore } from "./AfricabehaviorController.js"; 
import { getAsiaBehaviorScore } from "./AsiabehaviorController.js"; 

export const getCombinedBehaviorScore = async (req, res) => {
  try {
    const playerId = req.params.playerId;

    // ---------- CREATE FAKE res WITH status + json ----------
    const createFakeRes = () => {
      let dataStore = null;

      return {
        status: function () {
          return this; // chain support
        },
        json: function (data) {
          dataStore = data;
        },
        getData: function () {
          return dataStore;
        }
      };
    };

    // ------------ AFRICA SCORE CALL --------------
    const fakeResAfrica = createFakeRes();
    await getBehaviorScore(
      { ...req, params: { playerId } },
      fakeResAfrica
    );
    const africaResponse = fakeResAfrica.getData();

    // ------------ ASIA SCORE CALL ---------------
    const fakeResAsia = createFakeRes();
    await getAsiaBehaviorScore(
      { ...req, params: { id: playerId } },
      fakeResAsia
    );
    const asiaResponse = fakeResAsia.getData();

    // ---------- FINAL RESPONSE TO ADMIN ----------
    return res.json({
      success: true,
      africa: africaResponse,
      asia: asiaResponse,
    });

  } catch (error) {
    console.error("Combined Score Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error generating combined behavior score",
    });
  }
};
