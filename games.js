// One Night Werewolf

AllRoles = new Mongo.Collection("all_roles");
Games    = new Mongo.Collection("games");
GamePlayers = new Mongo.Collection("game_players");
GameRoles   = new Mongo.Collection("game_roles"); // {gameid, roleid, name, order}

// TODO: Move this to a separate file
var GamePlayer = function (gameid, userid, username) {
  this.gameid = gameid;
  this.userid = userid;
  this.username = username;
  // TODO: Server should only publish this to everyone after the game is over
  this.myinfo = {
    orig_role      : null,    // rolename string
    curr_role      : null,    // rolename string
    night_targets  : [],      // gameplayerid or index to the unused_roles array
    night_result   : null,    // A string describing what the player did at night. Used by Robber.
    night_done     : false,
    voted_for      : null,    // gameplayerid
    received_votes : 0,
    died           : false,
    won            : false,
  };
};

var Game = function (user) {
  this.createdAt = new Date();
  this.text      = "Game created by "+user.username;
  this.ownerid   = user._id;
  this.ownername = user.username;
  this.gameState = "Creating";   // Creating, Night, Day, Done
  this.mostVotedPlayers = [];    // gameplayerid
  this.myinfo = {
    //this.time                  : null,
    //this.game_starter_last_seen: 0,
    unused_roles          : [],
    orig_werewolves       : [],
    example_game          : false,
    no_shuffle            : false,
  };
};

// Fisher-Yates shuffle http://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}

if (Meteor.isClient) {
  UI.registerHelper("players", function() {
    return GamePlayers.find({gameid:this._id}, {sort:{username:1}});
  });
  UI.registerHelper("otherPlayers", function() {
    return GamePlayers.find({gameid:this._id, userid:{$ne:Meteor.userId()}}, {sort:{username:1}});
  });
  UI.registerHelper("gamePlayerId_username", function(gamePlayerId) {
    var gamePlayer = GamePlayers.findOne(gamePlayerId);
    return gamePlayer ? gamePlayer.username : null;
  });
  UI.registerHelper("all_roles", function() {
    return AllRoles.find({}, {sort: {order:1}});
  });
  UI.registerHelper("game_roles", function() {
    return GameRoles.find({gameid:this._id}, {sort:{order:1}});
  });
  UI.registerHelper("gameStateNotCreating", function() {
    return Games.findOne({_id:this._id}).gameState !== "Creating";
  });
  UI.registerHelper("shortRoleName", function() {
    if (this.name === "Werewolf") { return "WW"; }
    else if (this.name === "Seer") { return "SR"; }
    else if (this.name === "Robber") { return "RB"; }
    else if (this.name === "Troublemaker") { return "TM"; }
    else if (this.name === "Insomniac") { return "IN"; }
    else if (this.name === "Villager") { return "VL"; }
    else { return "?"; }
  });
  UI.registerHelper("isOwnerThisGame", function() {
    return this.ownerid === Meteor.userId();
  });
  UI.registerHelper("showAllInfo", function() {
    return (this.example_game || this.ownerid === Meteor.userId() || this.gameState === "Done");
  });
  UI.registerHelper("myDebugResults", function() {
    return nightResult(this._id, GamePlayers.findOne({gameid:this._id, userid:Meteor.userId()})._id);
  });
  UI.registerHelper("gameStateTest", function(op, value) {
    // TODO: This is horrible must be a better way, maybe pass in a query object?
    if (op === "eq") {
      return Games.findOne({_id:this._id}).gameState === value;
    } else if (op === "ne") {
      return Games.findOne({_id:this._id}).gameState !== value;
    } else {
      throw new Meteor.Error("Internal error");
    }
  });
  UI.registerHelper("isPlayingThisGame", function() {
    return isPlayingThisGameTest(this);
  });
  function isPlayingThisGameTest(game) {
    var gamePlayer = GamePlayers.findOne({gameid:game._id, userid:Meteor.userId()});
    return (gamePlayer) ? true : false;
  }

  function nightResult(gameid, gamePlayerId) {
    var game = Games.findOne(gameid);
    var gamePlayer = GamePlayers.findOne(gamePlayerId);
    if (!gamePlayer) {
      return "...";
    }
    var night_targets = gamePlayer.myinfo.night_targets;
    var str;
    if (gamePlayer.myinfo.orig_role == "Seer") {
      if (gamePlayer.myinfo.night_done) {
        if (night_targets.length === 2) {
          str = "You peeked at 2 of the 3 middle cards." +
                   " #" + night_targets[0] + "=" + game.myinfo.unused_roles[night_targets[0]].name +
                   " #" + night_targets[1] + "=" + game.myinfo.unused_roles[night_targets[1]].name;
        } else {
          var targetPlayer = GamePlayers.findOne({_id:night_targets[0]});
          str = "You peeked at " + targetPlayer.username + " and saw he was the " + targetPlayer.myinfo.orig_role;
        }
      } else {
        str = "Seer results will go here";
      }
    } else if (gamePlayer.myinfo.orig_role == "Robber") {
      if (gamePlayer.myinfo.night_done) {
        if (night_targets.length === 0) {
          str = "Did not rob";
        } else {
          var targetPlayer = GamePlayers.findOne({_id:night_targets[0]});
          str =
            "You became the " + gamePlayer.myinfo.night_result +
            " and " + (targetPlayer ? targetPlayer.username : "...") + " became the Robber";
        }
      } else {
        str = "Robber results will go here";
      }
    } else if (gamePlayer.myinfo.orig_role == "Werewolf") {
      if (game.gameState === "Creating" || !gamePlayer.myinfo.night_done) {
        str = "Error: Not night yet";
      }
      var orig_werewolves = game.myinfo.orig_werewolves;
      if (orig_werewolves.length === 1) {
        var i = gamePlayer.myinfo.night_targets[0];
        var centerPeek = game.myinfo.unused_roles[i].name;
        str = "You are the only Werewolf. Center card #" + (i+1) + " is " + centerPeek;
      } else {
        str = "The Werewolves are:";
        for (var i=0; i<orig_werewolves.length; i++) {
          str += " " + orig_werewolves[i].username;
        }
      }
    } else {
      str = "...";
    }
    return str;
  }
  Template.home.helpers({
    findAllUsers: function() {
      return Meteor.users.find({});
    },
    findAllGames: function() {
      return Games.find({});
    },
    isPlayingThisGame: function() {
      result = isPlayingThisGameTest(this);
      return result;
    },
  });
  Template.home.rendered = function() {
    $("[data-toggle='tooltip']").tooltip();
  };
  Template.home.events({
    "click .add-game": function() {
      Meteor.call("addGame");
    },
  });
  Template.showGame.helpers({
    myRole: function(role) {
      var gamePlayer = GamePlayers.findOne({gameid:this._id, userid:Meteor.userId()});
      return gamePlayer && gamePlayer.myinfo.orig_role === role;
    },
  });
  Template.showGame.events({
    "click .start-game": function() {
      // Start or Reset game based on current game state
      // TODO: Icon should switch to a recycle instead of play
      if (this.gameState === "Creating") {
        Meteor.call("startGame", this);
      } else {
        Meteor.call("resetGame", this);
      }
    },
    "click .delete-game": function() {
      Meteor.call("deleteGame", this._id);
    },
    "click .toggle-join": function() {
      result = isPlayingThisGameTest(this);
      if (result) {
        Meteor.call("leaveGame", this._id);
      } else {
        Meteor.call("joinGame", this._id);
      }
    },
    "click .add-role": function (event) {
      // TODO: This method can't pass the real object, only a string gameId.
      //       Maybe use a jQuery call to find the parent object?
      var gameId = $(event.currentTarget).attr("data-game");
      Meteor.call("addRole", gameId, this);
    },
    "click .delete-role": function () {
      Meteor.call("deleteRole", this);
    },
  });
  Template.fullGameState.helpers({
    //gameStateNotCreating: function() {
    //  return Games.findOne({_id:this._id}).gameState !== "Creating";
    //},
    myRole: function() {
      var gamePlayer = GamePlayers.findOne({gameid:this._id, userid:Meteor.userId()});
      if (!gamePlayer) {
        return "N/A -- You are an observer";
      }
      return gamePlayer.myinfo.orig_role;
    },
    debugResults: function() {
      return nightResult(this.gameid, this._id);
    }
  });
  //Template.fullGameState.events({
  //});
  Template.seerNight.helpers({
    seerResults: function() {
      var gamePlayer = GamePlayers.findOne({gameid:this._id, userid:Meteor.userId()});
      return nightResult(this._id, gamePlayer._id);
    },
  });
  Template.seerNight.events({
    "submit form": function(event) {
      event.preventDefault();
      var result = $("input[name='player']:checked").val();
      Meteor.call("seerNightSubmit", this, Meteor.userId(), result);
    },
  });
  Template.robberNight.helpers({
    robberResults: function() {
      var gamePlayer = GamePlayers.findOne({gameid:this._id, userid:Meteor.userId()});
      return nightResult(this._id, gamePlayer._id);
    },
  });
  Template.robberNight.events({
    "submit form": function(event) {
      event.preventDefault();
      var result = $("input[name='player']:checked").val();
      Meteor.call("robberNightSubmit", this, Meteor.userId(), result);
    },
  });
  Template.wolfNight.helpers({
    wolfNightScript: function() {
      var game = Games.findOne({_id:this._id});
      var gamePlayer = GamePlayers.findOne({gameid:this._id, userid:Meteor.userId()});
      if (game.gameState === "Creating" || !gamePlayer.myinfo.night_done) {
        return "Error: Not night yet";
      }
      var orig_werewolves = game.myinfo.orig_werewolves;
      if (orig_werewolves.length === 1) {
        var i = gamePlayer.myinfo.night_targets[0];
        var centerPeek = game.myinfo.unused_roles[i].name;
        str = "You are the only Werewolf. Center card #" + (i+1) + " is " + centerPeek;
        return str;
      } else {
        str = "The Werewolves are:";
        for (var i=0; i<orig_werewolves.length; i++) {
          str += " " + orig_werewolves[i].username;
        }
        return str;
      }
    },
  });
  Template.vote.events({
    "submit form": function(event) {
      event.preventDefault();
      var result = $("input[name='voteplayer']:checked").val();
      Meteor.call("voteSubmit", this, Meteor.userId(), result);
    },
  });

  Accounts.ui.config({
    passwordSignupFields: "USERNAME_ONLY"
  });
}

Meteor.methods({
  addGame: function () {
    if (!Meteor.userId()) { throw new Meteor.Error("not-authorized"); }
    var gameId = Games.insert(new Game(Meteor.user()));
    Meteor.call("joinGame", gameId);
  },
  deleteGame: function (gameId) {
    if (game.owner !== Meteor.userId()) { throw new Meteor.Error("not-authorized"); }
    Games.remove(gameId);
  },
  joinGame: function (gameId) {
    if (!Meteor.userId()) { throw new Meteor.Error("not-authorized"); }
    GamePlayers.insert(new GamePlayer(gameId, Meteor.userId(), Meteor.user().username));
  },
  leaveGame: function (gameId) {
    var gamePlayerId = GamePlayers.findOne({gameid:gameId, userid:Meteor.userId()});
    GamePlayers.remove(gamePlayerId);
  },
  addRole: function (gameId, role) {
    if (!Meteor.userId()) { throw new Meteor.Error("not-authorized"); }
    GameRoles.insert({gameid:gameId, roleid:role._id, name:role.name, order:role.order});
  },
  deleteRole: function (role) {
    if (!Meteor.userId()) { throw new Meteor.Error("not-authorized"); }
    GameRoles.remove(role._id);
  },
});

if (Meteor.isServer) {
  Meteor.publish("all_roles", function() {
    return AllRoles.find({});
  });
  Meteor.publish("games", function() {
    return Games.find({});
  });
  Meteor.publish("game_players", function() {
    return GamePlayers.find({});
  });
  Meteor.publish("game_roles", function() {
    return GameRoles.find({});
  });
  Meteor.publish("directory", function() {
    return Meteor.users.find({},{fields: {username:1}});
  });
  Meteor.startup(function () {
    if (AllRoles.find().count() === 0) {
      AllRoles.insert({name: "Werewolf",     order: 1});
      AllRoles.insert({name: "Seer",         order: 2});
      AllRoles.insert({name: "Robber",       order: 3});
      AllRoles.insert({name: "Troublemaker", order: 4});
      AllRoles.insert({name: "Insomniac",    order: 5});
      AllRoles.insert({name: "Villager",     order: 999});
    }
  });

  // TODO: Maybe this could be a live query?
  function checkNightDone(gameid) {
    var game = Games.findOne(gameid);
    if (game.gameState !== "Night") {
      throw new Meteor.Error("Should only call this at Night");
      return;
    }
    var nightDone = true;
    GamePlayers.find({gameid:gameid}).forEach(function (gamePlayer) {
      if (!gamePlayer.myinfo.night_done) {
        nightDone = false;
        return;
      }
    });
    if (nightDone) {
      Games.update(gameid, {$set: {"gameState": "Day"}});
    }
  }
  function checkDayDone(gameid) {
    var game = Games.findOne(gameid);
    if (game.gameState !== "Day") {
      throw new Meteor.Error("Should only call this at Night");
    }
    var numVoted    = GamePlayers.find({gameid:gameid, "myinfo.voted_for":{$ne:null}}).count();
    var numNotVoted = GamePlayers.find({gameid:gameid, "myinfo.voted_for":     null }).count();
    // if (dayTimerExpired ? numVoted > 0 : numNotVoted === 0)
    if (numNotVoted === 0) {
      GamePlayers.find({gameid:gameid}).forEach(function (gamePlayer) {
        GamePlayers.update(gamePlayer.myinfo.voted_for, {$inc:{"myinfo.received_votes":1}});
      });
      var mostVotes = 0;
      var mostVotedPlayers = [];
      var wolfDied = false;
      var atLeastOneWolf = false;
      GamePlayers.find({gameid:gameid}).forEach(function (gamePlayer) {
        if (gamePlayer.myinfo.received_votes > mostVotes) {
          mostVotes = gamePlayer.myinfo.received_votes;
          mostVotedPlayers = [gamePlayer._id];
          wolfDied = gamePlayer.myinfo.curr_role === "Werewolf";
        } else if (gamePlayer.myinfo.received_votes === mostVotes) {
          mostVotedPlayers.push(gamePlayer._id);
          wolfDied = wolfDied || gamePlayer.myinfo.curr_role === "Werewolf";
        }
        if (mostVotes === 1) {
          mostVotedPlayers = []; // It takes at least 2 votes to kill
          wolfDied = false;
        }
        if (gamePlayer.myinfo.curr_role === "Werewolf") {
          atLeastOneWolf = true;
        }
      });
      for (var i; i < mostVotedPlayers.length; i++) {
        GamePlayers.update(mostVotedPlayers[i], {$set:{"myinfo.died":true}});
      }
      GamePlayers.find({gameid:gameid}).forEach(function (gamePlayer) {
        if (gamePlayer.myinfo.curr_role === "Werewolf") {
          GamePlayers.update(gamePlayer, {$set:{"myinfo.won":!wolfDied}});
        } else {
          if (atLeastOneWolf) {
            GamePlayers.update(gamePlayer, {$set:{"myinfo.won":wolfDied}});
          } else {
            GamePlayers.update(gamePlayer, {$set:{"myinfo.won":mostVotedPlayers.length===0}});
          }
        }
      });
      Games.update(gameid, {$set: {"gameState": "Done"}});
    }
  }

  Meteor.methods({
    resetGame: function(game) {
      if (game.ownerid !== Meteor.userId()) {
        console.log("Error: Only owner can do this", game.ownerid, Meteor.userId());
        return;
      }
      // Reset game state
      Games.update({_id:game._id}, {$set: {"gameState": "Creating"}});
      Games.update({_id:game._id}, {$set: {"myinfo.orig_werewolves": []}});
      GamePlayers.find({gameid:game._id}).forEach(function (gamePlayer) {
        GamePlayers.update({_id:gamePlayer._id}, new GamePlayer(game._id, gamePlayer.userid, gamePlayer.username));
      });
    },
    startGame: function(game) {
      // TODO: Fix minimum code
      // TODO: Better error display
      if (game.ownerid !== Meteor.userId()) {
        console.log("Error: Only owner can do this", game.ownerid, Meteor.userId());
        return;
      }
      if (GamePlayers.find({gameid:game._id}).count() < 2) {
        console.log("Error: Must have at least 2 players");
        return
      }
      if (GameRoles.find({gameid:game._id}).count() !== GamePlayers.find({gameid:game._id}).count() + 3) {
        console.log("Error: Must have 3 more roles than players");
        return
      }

      // Reset game state
      Meteor.call("resetGame", game);
      Games.update({_id:game._id}, {$set: {"gameState": "Creating"}});
      Games.update({_id:game._id}, {$set: {"myinfo.orig_werewolves": []}});
      GamePlayers.find({gameid:game._id}).forEach(function (gamePlayer) {
        GamePlayers.update({_id:gamePlayer._id}, new GamePlayer(game._id, gamePlayer.userid, gamePlayer.username));
      });

      // Assign roles
      var unusedRoles = GameRoles.find({gameid:game._id}).fetch();
      if (!game.myinfo.no_shuffle) {
        shuffleArray(unusedRoles);
      }
      GamePlayers.find({gameid:game._id}).forEach(function (gamePlayer) {
        var role = unusedRoles.pop();
        GamePlayers.update({_id:gamePlayer._id}, {$set: { "myinfo.curr_role": role.name, "myinfo.orig_role": role.name }});
        if (role.name === "Werewolf") {
          Games.update({_id:game._id}, {$push: {"myinfo.orig_werewolves": {userid:gamePlayer.userid, username:gamePlayer.username}}});
        }
      });
      Games.update({_id:game._id}, {$set: {"myinfo.unused_roles": unusedRoles}});

      // Werewolf night logic -- no input from user required, so execute now
      game = Games.findOne(game._id);
      var orig_werewolves = game.myinfo.orig_werewolves;
      GamePlayers.find({gameid:game._id}).forEach(function (gamePlayer) {
        if (gamePlayer.myinfo.orig_role === "Werewolf") {
          if (orig_werewolves.length === 1) {
            var pick = Math.floor((Math.random()*3));  // random number between 0 and 2
            var centerPeek = game.myinfo.unused_roles[pick].name;
            GamePlayers.update({_id:gamePlayer._id}, {$set: {"myinfo.night_targets": [pick],
                                                             "myinfo.night_done"   : true}});
          } else {
            GamePlayers.update({_id:gamePlayer._id}, {$set: {"myinfo.night_done"   : true}});
          }
        }
      });

      // Change state to night
      Games.update({_id:game._id}, {$set: {"gameState": "Night"}});

      // Check if night is already done
      checkNightDone(game._id);
    },
    seerNightSubmit: function(game, userid, target) {
      var night_targets;
      if (GamePlayers.findOne({gameid:game._id, userid:userid}).myinfo.night_done) {
        console.log("Error: sns Cannot do more than once");
        return;
      }
      if (target === "middle") {
        var peeks = shuffleArray([0,1,2]);
        night_targets = [peeks[0], peeks[1]];
      } else {
        night_targets = [target];
      }
      GamePlayers.update({gameid:game._id, userid:userid}, {$set: {"myinfo.night_targets": night_targets,
                                                                   "myinfo.night_done"   : true}});
      checkNightDone(game._id);
    },
    robberNightSubmit: function(game, userid, target) {
      if (GamePlayers.findOne({gameid:game._id, userid:userid}).myinfo.night_done) {
        console.log("Error: rns Cannot do more than once");
        return;
      }
      if (target === "nobody") {
        GamePlayers.update({gameid:game._id, userid:userid}, {$set: {
          "myinfo.night_targets": [],
          "myinfo.night_done"   : true}});
      } else {
        // swap robberRole and targetRole
        var robberRole = GamePlayers.findOne({gameid:game._id, userid:userid}).myinfo.curr_role;
        var targetRole = GamePlayers.findOne(target).myinfo.curr_role;
        GamePlayers.update({gameid:game._id, userid:userid}, {$set: {
          "myinfo.curr_role"    : targetRole,
          "myinfo.night_targets": [target],
          "myinfo.night_result" : targetRole,
          "myinfo.night_done"   : true}});
        GamePlayers.update(target, {$set: {"myinfo.curr_role" : robberRole}});
      }
      checkNightDone(game._id);
    },
    voteSubmit: function(game, userid, target) {
      if (game.gameState !== "Day") {
        console.log("Error: Can only vote during Day");
        return;
      }
      if (target === "nobody") {
        GamePlayers.update({gameid:game._id, userid:userid}, {$set: {"myinfo.voted_for" : null }});
      } else {
        GamePlayers.update({gameid:game._id, userid:userid}, {$set: {"myinfo.voted_for" : target }});
      }
      checkDayDone(game._id);
    },
  });
}
