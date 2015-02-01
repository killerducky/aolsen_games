Router.configure({
  layoutTemplate: "appBody",
  waitOn: function() {
    return [
      Meteor.subscribe("all_roles"),
      Meteor.subscribe("games"),
      Meteor.subscribe("game_players"),
      Meteor.subscribe("game_roles"),
      Meteor.subscribe("user_presences")
    ];
  },
});

Router.map(function(){
  this.route("home", {path: "/"});
  this.route("/game/:_id", function() {
    this.render("showGame", {
      data : function() {
        return Games.findOne({_id:this.params._id});
      }
    });
  });
  this.route("about");
});
